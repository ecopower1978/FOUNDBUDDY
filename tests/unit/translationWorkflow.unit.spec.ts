import { describe, expect, it } from 'vitest'

import {
  getNextTranslationLocale,
  getTranslationLocale,
  getTranslationQueue,
  getTranslationQueueOrder,
  translationLocaleOrder,
  type TranslationStatus,
} from '@/i18n/translationWorkflow'

const sourceHash = 'source-hash'

function status(
  locale: TranslationStatus['locale'],
  overrides: Partial<TranslationStatus> = {},
): TranslationStatus {
  return {
    locale,
    mode: 'auto',
    sourceHash,
    status: 'pending',
    ...overrides,
  }
}

describe('translation queue ordering', () => {
  it('keeps English first and processes one locale queue at a time', () => {
    expect(translationLocaleOrder).toEqual(['en', 'de', 'es', 'pt', 'ar', 'he', 'ko', 'zh-TW'])
    expect(getTranslationQueueOrder()).toEqual([
      'translations',
      'translations:en',
      'translations:de',
      'translations:es',
      'translations:pt',
      'translations:ar',
      'translations:he',
      'translations:ko',
      'translations:zh-TW',
    ])
  })

  it('skips manual and completed locales but keeps failed locales in priority order', () => {
    const statuses = [
      status('en', { status: 'complete' }),
      status('de', { mode: 'manual', status: 'complete' }),
      status('es', { status: 'failed' }),
    ]

    expect(getNextTranslationLocale(statuses, sourceHash)).toBe('es')
    expect(getNextTranslationLocale(statuses, sourceHash, 'es')).toBe('pt')
  })

  it('defaults legacy jobs without a locale to English', () => {
    expect(getTranslationLocale(undefined)).toBe('en')
    expect(getTranslationLocale('not-a-locale')).toBe('en')
    expect(getTranslationQueue('zh-TW')).toBe('translations:zh-TW')
  })
})
