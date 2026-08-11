import { describe, expect, it } from 'vitest'

import { demoteNestedH1 } from '@/utilities/richTextHeadings'

describe('rich-text heading normalization', () => {
  it('demotes nested h1 nodes while preserving other headings', () => {
    expect(
      demoteNestedH1({
        root: {
          children: [
            { children: [{ text: 'Title' }], tag: 'h1', type: 'heading' },
            { children: [{ text: 'Section' }], tag: 'h3', type: 'heading' },
          ],
        },
      }),
    ).toEqual({
      root: {
        children: [
          { children: [{ text: 'Title' }], tag: 'h2', type: 'heading' },
          { children: [{ text: 'Section' }], tag: 'h3', type: 'heading' },
        ],
      },
    })
  })
})
