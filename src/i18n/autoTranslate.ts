import * as OpenCC from 'opencc-js'

import { localeMeta, type SiteLocale } from './config'

type Translate = (value?: string | null) => Promise<string | null | undefined>
const toTaiwanTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })

export async function translateText(
  text: string,
  source: SiteLocale,
  target: SiteLocale,
): Promise<string> {
  if (!text.trim() || source === target) return text
  if (source === 'zh-CN' && target === 'zh-TW') {
    return toTaiwanTraditional(text)
  }

  const endpoint = process.env.LIBRETRANSLATE_URL?.replace(/\/$/, '')
  if (!endpoint) throw new Error('LibreTranslate is not configured')
  const response = await fetch(`${endpoint}/translate`, {
    body: JSON.stringify({
      ...(process.env.LIBRETRANSLATE_API_KEY
        ? { api_key: process.env.LIBRETRANSLATE_API_KEY }
        : {}),
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
