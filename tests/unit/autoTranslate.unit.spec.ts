import { describe, expect, it } from 'vitest'

import { translateText, translateTextWithCoverage } from '@/i18n/autoTranslate'

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
