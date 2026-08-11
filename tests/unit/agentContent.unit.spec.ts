import { describe, expect, it } from 'vitest'

import { convertAgentContent } from '@/utilities/agentContent'

describe('agent article conversion', () => {
  it('keeps supported HTML formatting and removes executable content', async () => {
    const content = await convertAgentContent({
      content:
        '<h2>Heading</h2><p>Safe <strong>bold</strong><script>alert(1)</script><a href="javascript:alert(2)">link</a></p><ul><li>Item</li></ul>',
      format: 'html',
    })
    const serialized = JSON.stringify(content)

    expect(serialized).toContain('"type":"heading"')
    expect(serialized).toContain('"format":1')
    expect(serialized).toContain('"type":"list"')
    expect(serialized).not.toMatch(/script|javascript:|alert\(/i)
  })

  it('converts Markdown headings, emphasis, and lists', async () => {
    const content = await convertAgentContent({
      content: '## Heading\n\nA **bold** paragraph.\n\n- First\n- Second',
      format: 'markdown',
    })
    const serialized = JSON.stringify(content)

    expect(serialized).toContain('"tag":"h2"')
    expect(serialized).toContain('"format":1')
    expect(serialized).toContain('"listType":"bullet"')
  })
})
