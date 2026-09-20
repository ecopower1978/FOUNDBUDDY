import * as OpenCC from 'opencc-js'

import { env } from '@/config/env'
import { localeMeta, type SiteLocale } from './config'
import {
  translateWithDictionary,
  type DictionaryTranslation,
  type TranslationTargetLocale,
} from './translationDictionary'

type Translate = (value?: string | null) => Promise<string | null | undefined>
const toTaiwanTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })

async function translateWithLibreTranslate(
  text: string,
  source: SiteLocale,
  target: SiteLocale,
): Promise<string> {
  const endpoint = env.translation.url.replace(/\/$/, '')
  if (!endpoint) throw new Error('LibreTranslate is not configured')
  const response = await fetch(`${endpoint}/translate`, {
    body: JSON.stringify({
      ...(env.translation.apiKey ? { api_key: env.translation.apiKey } : {}),
      format: 'text',
      q: text,
      source: localeMeta[source].translationCode,
      target: localeMeta[target].translationCode,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) throw new Error(`LibreTranslate returned ${response.status}`)
  const result = (await response.json()) as { translatedText?: string }
  if (!result.translatedText) throw new Error('LibreTranslate returned an empty translation')
  return result.translatedText
}

function translationPrompt(target: SiteLocale): string {
  return [
    'You are a professional translator for a B2B pet-product industry website.',
    `Translate the following text from Simplified Chinese into ${localeMeta[target].label}.`,
    'Return only the translation, with no explanation, labels, quotation marks, or markdown fences.',
    'Preserve product names, brand names, model numbers, URLs, numbers, punctuation, and inline markup exactly.',
  ].join(' ')
}

export function extractYunbloomContent(body: string): string {
  const chunks: string[] = []

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue

    const payload = trimmed.slice('data:'.length).trim()
    if (!payload || payload === '[DONE]') continue

    try {
      const event = JSON.parse(payload) as {
        content?: unknown
        choices?: Array<{
          delta?: { content?: unknown }
          message?: { content?: unknown }
        }>
      }
      const content =
        typeof event.content === 'string'
          ? event.content
          : typeof event.choices?.[0]?.delta?.content === 'string'
            ? event.choices[0].delta.content
            : typeof event.choices?.[0]?.message?.content === 'string'
              ? event.choices[0].message.content
              : ''
      if (content) chunks.push(content)
    } catch {
      // Ignore non-data SSE lines and let the caller report an empty response.
    }
  }

  if (chunks.length) return chunks.join('').trim()

  try {
    const json = JSON.parse(body) as {
      content?: unknown
      choices?: Array<{ message?: { content?: unknown } }>
    }
    if (typeof json.content === 'string') return json.content.trim()
    if (typeof json.choices?.[0]?.message?.content === 'string') {
      return json.choices[0].message.content.trim()
    }
  } catch {
    // The upstream is expected to return SSE; an invalid response is handled
    // as a failed translation by the caller.
  }

  return ''
}

export type YunbloomBatchArticle = {
  content: string
  contentFormat: string
  locale: string
  status: string
  summary: string
  title: string
}

export type YunbloomBatchTranslations = Record<
  TranslationTargetLocale,
  YunbloomBatchArticle
>

const yunbloomBatchLocales = [
  'en',
  'de',
  'es',
  'pt',
  'ar',
  'he',
  'ko',
  'zh-TW',
] as const satisfies readonly TranslationTargetLocale[]

/**
 * The translation robot is configured to return one JSON object containing
 * every site locale. Keep parsing strict so a truncated or partial response
 * never gets written into only some localized fields.
 */
export function parseYunbloomBatchContent(content: string): YunbloomBatchTranslations {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  const candidates = [
    withoutFence,
    start >= 0 && end > start ? withoutFence.slice(start, end + 1) : '',
  ].filter(Boolean)

  let parsed: unknown
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate)
      break
    } catch {
      // Try the next candidate so prose around a valid JSON object is harmless.
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Yunbloom batch translation returned invalid JSON')
  }

  const root = parsed as Record<string, unknown>
  const source =
    root.translations && typeof root.translations === 'object'
      ? (root.translations as Record<string, unknown>)
      : root
  const result = {} as YunbloomBatchTranslations

  for (const locale of yunbloomBatchLocales) {
    const item = source[locale]
    if (!item || typeof item !== 'object') {
      throw new Error(`Yunbloom batch translation is missing locale ${locale}`)
    }
    const value = item as Record<string, unknown>
    for (const field of ['title', 'summary', 'content'] as const) {
      if (typeof value[field] !== 'string') {
        throw new Error(`Yunbloom batch translation is missing ${locale}.${field}`)
      }
    }
    result[locale] = {
      content: value.content as string,
      contentFormat: typeof value.contentFormat === 'string' ? value.contentFormat : 'html',
      locale,
      status: typeof value.status === 'string' ? value.status : 'published',
      summary: value.summary as string,
      title: value.title as string,
    }
  }

  return result
}

const yunbloomBatchPrompt = [
  'You are the batch article translation engine for FoundBuddy, a B2B pet-product website.',
  'The user message is one JSON object containing a Simplified Chinese article.',
  'Translate title, summary, and every natural-language text node in content into all eight target locales: en, de, es, pt, ar, he, ko, zh-TW.',
  'The content field may be HTML. Preserve HTML tags, order, links, URLs, numbers, brand names, model names, and JSON structure; translate the text inside HTML tags and never leave translatable Chinese in a target translation.',
  'Return one compact valid JSON object with exactly those eight top-level locale keys. Each value must contain title, summary, content, contentFormat, locale, and status. Do not return Markdown, code fences, commentary, or partial locales.',
  'Use contentFormat html and status published. Use Traditional Chinese for zh-TW.',
].join(' ')

export async function translateArticleWithYunbloomBatch(input: {
  content: string
  contentFormat: 'html'
  locale: 'zh-CN'
  sourceUrl?: string
  status: 'published'
  summary: string
  title: string
}): Promise<YunbloomBatchTranslations> {
  const endpoint = env.translation.url.replace(/\/$/, '')
  if (!endpoint) throw new Error('Yunbloom batch translation endpoint is not configured')
  if (!env.translation.apiKey) {
    throw new Error('Yunbloom batch translation API key is not configured')
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      ...(env.translation.model ? { model: env.translation.model } : {}),
      extra: {},
      messages: [
        { content: yunbloomBatchPrompt, role: 'system' },
        { content: JSON.stringify(input), role: 'user' },
      ],
      sessionId: globalThis.crypto?.randomUUID?.() || `translation-batch-${Date.now()}`,
      source: 'api',
    }),
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${env.translation.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) throw new Error(`Yunbloom batch translation returned ${response.status}`)
  const content = extractYunbloomContent(await response.text())
  if (!content) throw new Error('Yunbloom batch translation returned an empty response')
  return parseYunbloomBatchContent(content)
}

async function translateWithYunbloom(
  text: string,
  source: SiteLocale,
  target: SiteLocale,
): Promise<string> {
  const endpoint = env.translation.url.replace(/\/$/, '')
  if (!endpoint) throw new Error('Yunbloom translation endpoint is not configured')
  if (!env.translation.apiKey) throw new Error('Yunbloom translation API key is not configured')

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      ...(env.translation.model ? { model: env.translation.model } : {}),
      extra: {},
      messages: [
        { content: translationPrompt(target), role: 'system' },
        { content: text, role: 'user' },
      ],
      sessionId: globalThis.crypto?.randomUUID?.() || `translation-${Date.now()}`,
      source: 'api',
    }),
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${env.translation.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) throw new Error(`Yunbloom translation returned ${response.status}`)
  const translated = extractYunbloomContent(await response.text())
  if (!translated) throw new Error('Yunbloom translation returned an empty response')
  return translated
}

export async function translateTextWithCoverage(
  text: string,
  source: SiteLocale,
  target: SiteLocale,
): Promise<DictionaryTranslation> {
  if (!text.trim() || source === target) {
    return { matchedTerms: 0, partial: false, text }
  }
  if (source === 'zh-CN' && target === 'zh-TW') {
    return { matchedTerms: 1, partial: false, text: toTaiwanTraditional(text) }
  }

  if (env.translation.provider === 'libretranslate') {
    return {
      matchedTerms: 1,
      partial: false,
      text: await translateWithLibreTranslate(text, source, target),
    }
  }

  // The batch robot is reserved for whole articles. Product and company
  // tasks still call this field-level function, so fall through to the safe
  // local dictionary instead of writing the robot's eight-locale JSON into a
  // single field.
  if (env.translation.provider === 'yunbloom') {
    return {
      matchedTerms: 1,
      partial: false,
      text: await translateWithYunbloom(text, source, target),
    }
  }

  if (source !== 'zh-CN' || target === 'zh-CN') {
    return { matchedTerms: 0, partial: true, text }
  }

  return translateWithDictionary(text, target as TranslationTargetLocale)
}

export async function translateText(
  text: string,
  source: SiteLocale,
  target: SiteLocale,
): Promise<string> {
  return (await translateTextWithCoverage(text, source, target)).text
}

export async function translateLexical(value: unknown, translate: Translate): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => translateLexical(item, translate)))
  }
  if (!value || typeof value !== 'object') return value

  const translated = await Promise.all(
    Object.entries(value as Record<string, unknown>).map(async ([key, child]) => {
      if (key === 'text' && typeof child === 'string') return [key, await translate(child)]
      return [key, await translateLexical(child, translate)]
    }),
  )
  return Object.fromEntries(translated)
}
