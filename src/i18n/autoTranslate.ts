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

  if (env.translation.provider === 'libretranslate' && env.translation.url) {
    try {
      return {
        matchedTerms: 1,
        partial: false,
        text: await translateWithLibreTranslate(text, source, target),
      }
    } catch {
      // A failed optional provider must not make the content job fail. The
      // local dictionary remains the zero-cost, offline fallback.
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
