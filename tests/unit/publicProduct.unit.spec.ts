import { describe, expect, it } from 'vitest'

import { sanitizePublicProduct } from '@/collections/Products'

describe('public product serialization', () => {
  it('removes workflow and translation internals from anonymous REST responses', async () => {
    const result = await sanitizePublicProduct({
      doc: {
        _status: 'published',
        id: 1,
        sku: 'INTERNAL-1',
        title: 'Public product',
        translationSourceHash: 'hash',
        translationStatus: [{ locale: 'en', mode: 'auto', status: 'complete' }],
        workflowState: 'draft',
      },
      req: { payloadAPI: 'REST', user: null },
    } as never)

    expect(result).toEqual({ id: 1, title: 'Public product' })
  })
})
