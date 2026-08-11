// @vitest-environment node

import { POST as aiChatPOST } from '@/app/(frontend)/api/ai-chat/route'
import config from '@/payload.config'
import type { User } from '@/payload-types'
import { randomBytes, randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let payload: Payload
let owner: User
let editor: User
let mediaID: number

const context = { disableRevalidate: true, translationWorkflow: true }

describe.sequential('permissions and product workflow', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    owner = await payload.create({
      collection: 'users',
      data: {
        email: `owner-${randomUUID()}@example.test`,
        name: 'Test Owner',
        password: randomBytes(24).toString('base64url'),
        role: 'owner',
      },
      overrideAccess: true,
    })
    editor = await payload.create({
      collection: 'users',
      data: {
        email: `editor-${randomUUID()}@example.test`,
        name: 'Test Editor',
        password: randomBytes(24).toString('base64url'),
        role: 'editor',
      },
      overrideAccess: true,
      user: owner,
    })

    const file = await sharp({
      create: {
        background: '#196b55',
        channels: 4,
        height: 640,
        width: 960,
      },
    })
      .webp()
      .toBuffer()
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Test product' },
      file: {
        data: file,
        mimetype: 'image/webp',
        name: `test-${randomUUID()}.webp`,
        size: file.length,
      },
      overrideAccess: false,
      user: editor,
    })
    mediaID = media.id
  })

  it('keeps drafts private and published products public', async () => {
    let product = await payload.create({
      collection: 'products',
      data: {
        images: [mediaID],
        shortDescription: 'Draft description',
        slug: `draft-${randomUUID()}`,
        title: 'Draft product',
        workflowState: 'draft',
      },
      context,
      draft: true,
      overrideAccess: false,
      user: editor,
    })

    const anonymousDrafts = await payload.find({
      collection: 'products',
      overrideAccess: false,
      where: { id: { equals: product.id } },
    })
    expect(anonymousDrafts.totalDocs).toBe(0)

    product = await payload.update({
      collection: 'products',
      id: product.id,
      data: { _status: 'published' },
      context,
      draft: false,
      overrideAccess: false,
      user: editor,
    })
    const anonymousPublished = await payload.find({
      collection: 'products',
      overrideAccess: false,
      where: { id: { equals: product.id } },
    })
    expect(anonymousPublished.totalDocs).toBe(1)

    await expect(
      payload.delete({
        collection: 'products',
        id: product.id,
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
  })

  it('requires product essentials before publishing', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        shortDescription: 'Still missing an image',
        slug: `incomplete-${randomUUID()}`,
        title: 'Incomplete',
        workflowState: 'draft',
      },
      context,
      draft: true,
      overrideAccess: false,
      user: editor,
    })
    await expect(
      payload.update({
        collection: 'products',
        id: product.id,
        data: { _status: 'published' },
        context,
        draft: false,
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow(/图片/)
  })

  it('enforces the homepage maximum of eight products', async () => {
    const ids: number[] = []
    for (let index = 0; index < 9; index += 1) {
      const product = await payload.create({
        collection: 'products',
        data: {
          _status: 'published',
          images: [mediaID],
          shortDescription: `Published ${index}`,
          slug: `homepage-${index}-${randomUUID()}`,
          title: `Homepage ${index}`,
          workflowState: 'draft',
        },
        context,
        draft: false,
        overrideAccess: false,
        user: editor,
      })
      ids.push(product.id)
    }
    await expect(
      payload.updateGlobal({
        slug: 'homepage',
        context,
        data: { featuredProducts: ids },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
    await expect(
      payload.updateGlobal({
        slug: 'homepage',
        context,
        data: { featuredProducts: ids.slice(0, 8) },
        overrideAccess: false,
        user: editor,
      }),
    ).resolves.toBeDefined()
    const homepage = await payload.findGlobal({
      slug: 'homepage',
      depth: 0,
      overrideAccess: true,
    })
    expect(homepage.featuredProducts?.map(String)).toEqual(
      ids.slice(0, 8).map(String),
    )

    const draft = await payload.create({
      collection: 'products',
      data: {
        images: [mediaID],
        shortDescription: 'Not yet published',
        slug: `homepage-draft-${randomUUID()}`,
        title: 'Homepage draft',
        workflowState: 'draft',
      },
      context,
      draft: true,
      overrideAccess: false,
      user: editor,
    })
    await expect(
      payload.updateGlobal({
        slug: 'homepage',
        context,
        data: { featuredProducts: [draft.id] },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow(/已发布/)
  }, 30_000)

  it('protects the last owner and owner-only audit records', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: owner.id,
        data: { role: 'editor' },
        overrideAccess: false,
        user: owner,
      }),
    ).rejects.toThrow(/所有者/)
    await expect(
      payload.delete({
        collection: 'users',
        id: owner.id,
        overrideAccess: false,
        user: owner,
      }),
    ).rejects.toThrow(/当前登录账号/)
    await expect(
      payload.find({
        collection: 'audit-events',
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
    await expect(
      payload.find({
        collection: 'audit-events',
        overrideAccess: false,
        user: owner,
      }),
    ).resolves.toBeDefined()
  })

  it('prevents editors from creating accounts or changing their role', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          email: `blocked-${randomUUID()}@example.test`,
          name: 'Blocked account',
          password: randomBytes(24).toString('base64url'),
          role: 'editor',
        },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()

    const unchanged = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { role: 'owner' },
      overrideAccess: false,
      user: editor,
    })
    expect(unchanged.role).toBe('editor')
  })

  it('requires the owner confirmation path for permanent content deletion', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        images: [mediaID],
        shortDescription: 'Delete confirmation test',
        slug: `delete-${randomUUID()}`,
        title: 'Delete confirmation test',
        workflowState: 'draft',
      },
      context,
      draft: true,
      overrideAccess: false,
      user: editor,
    })

    await expect(
      payload.delete({
        collection: 'products',
        id: product.id,
        overrideAccess: false,
        user: owner,
      }),
    ).rejects.toThrow()

    await expect(
      payload.delete({
        collection: 'products',
        context: { disableRevalidate: true, permanentDeleteConfirmed: true },
        id: product.id,
        overrideAccess: true,
        user: owner,
      }),
    ).resolves.toBeDefined()
  })

  it('keeps customer service API settings owner-only', async () => {
    await expect(
      payload.findGlobal({
        slug: 'customer-service',
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()

    await expect(
      payload.updateGlobal({
        slug: 'customer-service',
        data: {
          apiKey: 'editor-must-not-write',
          apiUrl: 'https://editor.example.test/chat',
          authScheme: 'bearer',
          enabled: true,
        },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()

    const settings = await payload.updateGlobal({
      slug: 'customer-service',
      data: {
        apiKey: 'owner-managed-key',
        apiUrl: 'https://owner.example.test/chat',
        authScheme: 'x-api-key',
        enabled: true,
      },
      overrideAccess: false,
      user: owner,
    })
    expect(settings.apiUrl).toBe('https://owner.example.test/chat')
    expect(settings.authScheme).toBe('x-api-key')
    expect(settings.apiKey).toBe('owner-managed-key')
  })

  it('uses the owner-managed endpoint and authentication scheme for chat requests', async () => {
    await payload.updateGlobal({
      slug: 'customer-service',
      data: {
        apiKey: 'route-test-key',
        apiUrl: 'https://route-test.example.test/chat',
        authScheme: 'x-api-key',
        enabled: true,
      },
      overrideAccess: true,
      user: owner,
    })

    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ answer: 'Configured response' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )

    try {
      const response = await aiChatPOST(
        new NextRequest('http://localhost/api/ai-chat', {
          body: JSON.stringify({ locale: 'en', message: 'How can I request a quote?' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ answer: 'Configured response' })
      expect(upstream).toHaveBeenCalledWith(
        'https://route-test.example.test/chat',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-Key': 'route-test-key' }),
        }),
      )
    } finally {
      upstream.mockRestore()
    }
  })

  it('locks manually edited company translations', async () => {
    await payload.updateGlobal({
      slug: 'company',
      context,
      data: {
        brandName: 'Test company',
        contact: { email: 'sales@example.test' },
        heroDescription: 'Chinese source description',
        heroTitle: 'Chinese source title',
        translationSourceHash: 'manual-lock-source',
        translationStatus: [
          {
            locale: 'en',
            mode: 'auto',
            sourceHash: 'manual-lock-source',
            status: 'pending',
          },
        ],
      },
      locale: 'zh-CN',
      overrideAccess: true,
      user: owner,
    })

    await payload.updateGlobal({
      slug: 'company',
      data: {
        heroDescription: 'A manually maintained company introduction',
        heroTitle: 'A manually maintained company title',
      },
      locale: 'en',
      overrideAccess: false,
      user: editor,
    })

    const company = await payload.findGlobal({
      slug: 'company',
      fallbackLocale: false,
      locale: 'zh-CN',
      overrideAccess: true,
    })
    expect(
      company.translationStatus?.find((item) => item.locale === 'en')?.mode,
    ).toBe('manual')
  })
})
