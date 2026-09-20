import { describe, expect, it } from 'vitest'

import {
  extractYunbloomContent,
  parseYunbloomBatchContent,
  translateText,
  translateTextWithCoverage,
} from '@/i18n/autoTranslate'

describe('local Chinese script conversion', () => {
  it('converts simplified Chinese into Taiwan traditional Chinese without an upstream service', async () => {
    await expect(translateText('服务器软件与产品信息', 'zh-CN', 'zh-TW')).resolves.toBe(
      '伺服器軟體與產品資訊',
    )
  })

  it('uses the local dictionary for common trade phrases', async () => {
    await expect(translateText('可靠产品，清晰沟通，交付全球。', 'zh-CN', 'en')).resolves.toBe(
      'Reliable products. Clear communication. Global delivery.',
    )
  })

  it('marks unknown Chinese content as partial instead of inventing a translation', async () => {
    await expect(translateTextWithCoverage('量子织物采购', 'zh-CN', 'en')).resolves.toMatchObject({
      partial: true,
      text: '量子织物sourcing',
    })
  })
})

describe('Yunbloom streaming response parsing', () => {
  it('joins assistant content from SSE data events', () => {
    expect(
      extractYunbloomContent(
        'data: {"role":"assistant","content":"Reliable "}\n\n' +
          'data: {"role":"assistant","content":"pet products."}\n\n' +
          'data: {"end":{},"role":"assistant"}\n\n',
      ),
    ).toBe('Reliable pet products.')
  })

  it('accepts an OpenAI-compatible non-stream response as a fallback', () => {
    expect(
      extractYunbloomContent(
        JSON.stringify({ choices: [{ message: { content: 'Translated text' } }] }),
      ),
    ).toBe('Translated text')
  })

  it('parses one structured response containing every target locale', () => {
    const locales = ['en', 'de', 'es', 'pt', 'ar', 'he', 'ko', 'zh-TW']
    const payload = Object.fromEntries(
      locales.map((locale) => [
        locale,
        {
          content: `<p>${locale} content</p>`,
          contentFormat: 'html',
          locale,
          status: 'published',
          summary: `${locale} summary`,
          title: `${locale} title`,
        },
      ]),
    )

    expect(parseYunbloomBatchContent(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)).toEqual(
      payload,
    )
  })

  it('rejects a batch response when a locale is missing', () => {
    expect(() =>
      parseYunbloomBatchContent(
        JSON.stringify({
          en: {
            content: 'en',
            summary: 'en',
            title: 'en',
          },
        }),
      ),
    ).toThrow(
      'missing locale de',
    )
  })
})
