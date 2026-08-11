import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'

import { POST } from '@/app/(frontend)/api/blog/publish/route'

const originalToken = process.env.BLOG_PUBLISH_TOKEN
const originalPreviousToken = process.env.BLOG_PUBLISH_TOKEN_PREVIOUS
const originalTokens = process.env.BLOG_PUBLISH_TOKENS

afterEach(() => {
  if (originalToken === undefined) delete process.env.BLOG_PUBLISH_TOKEN
  else process.env.BLOG_PUBLISH_TOKEN = originalToken
  if (originalPreviousToken === undefined) delete process.env.BLOG_PUBLISH_TOKEN_PREVIOUS
  else process.env.BLOG_PUBLISH_TOKEN_PREVIOUS = originalPreviousToken
  if (originalTokens === undefined) delete process.env.BLOG_PUBLISH_TOKENS
  else process.env.BLOG_PUBLISH_TOKENS = originalTokens
})

describe('blog automation API defaults', () => {
  it('is indistinguishable from a missing route when no token is configured', async () => {
    delete process.env.BLOG_PUBLISH_TOKEN
    delete process.env.BLOG_PUBLISH_TOKEN_PREVIOUS
    delete process.env.BLOG_PUBLISH_TOKENS

    const response = await POST(
      new NextRequest('http://localhost/api/blog/publish', {
        body: '{}',
        method: 'POST',
      }),
    )
    expect(response.status).toBe(404)
  })
})
