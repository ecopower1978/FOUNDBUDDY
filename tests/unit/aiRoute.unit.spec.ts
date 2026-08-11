import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'

import { POST } from '@/app/(frontend)/api/ai-chat/route'

const originalAIURL = process.env.AI_CHAT_API_URL
const originalTrustProxy = process.env.TRUST_PROXY_HEADERS

afterEach(() => {
  if (originalAIURL === undefined) delete process.env.AI_CHAT_API_URL
  else process.env.AI_CHAT_API_URL = originalAIURL
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY_HEADERS
  else process.env.TRUST_PROXY_HEADERS = originalTrustProxy
})

function request(body: unknown, ip = '203.0.113.10') {
  return new NextRequest('http://localhost/api/ai-chat', {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': ip,
    },
    method: 'POST',
  })
}

describe('AI customer-service API boundaries', () => {
  it('rejects a declared oversized body before JSON parsing', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        body: '{}',
        headers: { 'Content-Length': '16385' },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(413)
  })

  it('rejects questions longer than 1,200 characters', async () => {
    const response = await POST(
      request({ locale: 'en', message: 'x'.repeat(1_201) }),
    )
    expect(response.status).toBe(400)
  })

  it('returns a localized contact fallback when AI is disabled', async () => {
    delete process.env.AI_CHAT_API_URL
    process.env.TRUST_PROXY_HEADERS = 'true'
    const response = await POST(
      request({ locale: 'zh-CN', message: '请问如何询价？' }, '203.0.113.11'),
    )
    expect(response.status).toBe(200)
    const result = (await response.json()) as { answer?: string }
    expect(result.answer).toContain('WhatsApp')
  })
})
