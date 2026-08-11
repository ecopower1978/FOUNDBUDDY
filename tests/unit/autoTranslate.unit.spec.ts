import { describe, expect, it } from 'vitest'

import { translateText } from '@/i18n/autoTranslate'

describe('local Chinese script conversion', () => {
  it('converts simplified Chinese into Taiwan traditional Chinese without an upstream service', async () => {
    await expect(
      translateText('服务器软件与产品信息', 'zh-CN', 'zh-TW'),
    ).resolves.toBe('伺服器軟體與產品資訊')
  })
})
