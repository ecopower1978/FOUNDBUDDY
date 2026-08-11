import { JSDOM } from 'jsdom'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

import type { Post } from '@/payload-types'

export type AgentContentFormat = 'auto' | 'html' | 'markdown' | 'plain'

type LexicalNode = Record<string, unknown> & { children?: LexicalNode[] }

const HTML_TAG_PATTERN = /<\/?(?:a|blockquote|br|code|em|h[1-6]|hr|i|li|ol|p|pre|strong|u|ul)\b/i
const MARKDOWN_PATTERN = /(^|\n)\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)|\[[^\]]+\]\([^)]+\)/

const elementDefaults = {
  direction: null,
  format: '',
  indent: 0,
  version: 1,
}

function textNode(text: string, format = 0): LexicalNode {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  }
}

function paragraph(children: LexicalNode[]): LexicalNode {
  return {
    ...elementDefaults,
    children: children.length ? children : [textNode('')],
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
  }
}

function sanitizeArticleHTML(input: string) {
  return sanitizeHtml(input, {
    allowedAttributes: {
      a: ['href', 'title'],
      code: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowedTags: [
      'a',
      'blockquote',
      'br',
      'code',
      'em',
      'h2',
      'h3',
      'h4',
      'hr',
      'i',
      'li',
      'ol',
      'p',
      'pre',
      'strong',
      'u',
      'ul',
    ],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  })
}

function inferFormat(content: string): Exclude<AgentContentFormat, 'auto'> {
  if (HTML_TAG_PATTERN.test(content)) return 'html'
  if (MARKDOWN_PATTERN.test(content)) return 'markdown'
  return 'plain'
}

function inlineNodes(node: Node, inheritedFormat = 0): LexicalNode[] {
  if (node.nodeType === node.TEXT_NODE) {
    const value = node.textContent?.replace(/\s+/g, ' ') || ''
    return value ? [textNode(value, inheritedFormat)] : []
  }
  if (node.nodeType !== node.ELEMENT_NODE) return []

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (tag === 'br') return [{ type: 'linebreak', version: 1 }]

  let format = inheritedFormat
  if (tag === 'strong') format |= 1
  if (tag === 'em' || tag === 'i') format |= 2
  if (tag === 'u') format |= 8
  if (tag === 'code') format |= 16

  const children = Array.from(element.childNodes).flatMap((child) => inlineNodes(child, format))
  if (tag !== 'a') return children

  const href = element.getAttribute('href')
  if (!href || children.length === 0) return children
  return [
    {
      ...elementDefaults,
      children,
      fields: {
        linkType: 'custom',
        newTab: false,
        url: href,
      },
      type: 'link',
    },
  ]
}

function listNode(element: Element): LexicalNode {
  const ordered = element.tagName.toLowerCase() === 'ol'
  const items = Array.from(element.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((item, index) => ({
      ...elementDefaults,
      children: Array.from(item.childNodes).flatMap((child) => {
        if (
          child.nodeType === child.ELEMENT_NODE &&
          ['ol', 'ul'].includes((child as Element).tagName.toLowerCase())
        ) {
          return [listNode(child as Element)]
        }
        return inlineNodes(child)
      }),
      type: 'listitem',
      value: index + 1,
    }))

  return {
    ...elementDefaults,
    children: items,
    listType: ordered ? 'number' : 'bullet',
    start: 1,
    tag: ordered ? 'ol' : 'ul',
    type: 'list',
  }
}

function blockNode(element: Element): LexicalNode | undefined {
  const tag = element.tagName.toLowerCase()
  if (tag === 'ul' || tag === 'ol') return listNode(element)
  if (tag === 'hr') return paragraph([])
  if (tag === 'blockquote') {
    return {
      ...elementDefaults,
      children: inlineNodes(element),
      type: 'quote',
    }
  }
  if (tag === 'pre') {
    return {
      ...elementDefaults,
      children: [textNode(element.textContent || '')],
      language: null,
      type: 'code',
    }
  }
  if (/^h[2-4]$/.test(tag)) {
    return {
      ...elementDefaults,
      children: inlineNodes(element),
      tag,
      type: 'heading',
    }
  }
  return paragraph(inlineNodes(element))
}

function htmlToLexical(input: string): Post['content'] {
  const document = new JSDOM(`<body>${sanitizeArticleHTML(input)}</body>`).window.document
  const children = Array.from(document.body.childNodes).flatMap((node) => {
    if (node.nodeType === node.TEXT_NODE) {
      const value = node.textContent?.trim()
      return value ? [paragraph([textNode(value)])] : []
    }
    if (node.nodeType !== node.ELEMENT_NODE) return []
    const block = blockNode(node as Element)
    return block ? [block] : []
  })

  return {
    root: {
      ...elementDefaults,
      children: children.length ? children : [paragraph([])],
      type: 'root',
    },
  } as Post['content']
}

function plainTextToLexical(content: string): Post['content'] {
  const paragraphs = content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => paragraph([textNode(text)]))

  return {
    root: {
      ...elementDefaults,
      children: paragraphs.length ? paragraphs : [paragraph([])],
      type: 'root',
    },
  } as Post['content']
}

export function articlePlainText(input: string) {
  return sanitizeHtml(input, { allowedAttributes: {}, allowedTags: [] })
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function convertAgentContent({
  content,
  format,
}: {
  content: string
  format: AgentContentFormat
  payload?: unknown
}): Promise<Post['content']> {
  const resolvedFormat = format === 'auto' ? inferFormat(content) : format
  if (resolvedFormat === 'plain') return plainTextToLexical(content)
  if (resolvedFormat === 'markdown') {
    return htmlToLexical(marked.parse(content, { async: false }) as string)
  }
  return htmlToLexical(content)
}
