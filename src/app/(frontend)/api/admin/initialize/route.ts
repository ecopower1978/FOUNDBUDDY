import { createHash, timingSafeEqual } from 'crypto'
import configPromise from '@payload-config'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

const BOOTSTRAP_TOKEN_HASH =
  '65e259b66178d2c12c82ae83457be76a3bc6ace5f4e5271f83295fc552387829'

const schema = z
  .object({
    confirmPassword: z.string(),
    email: z.string().trim().email().max(254),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(128),
    token: z.string().min(32).max(128),
  })
  .superRefine((data, context) => {
    if (data.password !== data.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      })
    }
  })

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
}

function isValidBootstrapToken(token: string) {
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(BOOTSTRAP_TOKEN_HASH, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isValidBootstrapToken(parsed.data.token)) {
    return NextResponse.json(
      { error: 'This initialization link is invalid.' },
      { headers: noStoreHeaders, status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const baseReq = await createLocalReq({}, payload)

  const marker = await payload.find({
    collection: 'audit-events',
    limit: 1,
    overrideAccess: true,
    req: baseReq,
    where: { action: { equals: 'admin.bootstrap.completed' } },
  })
  if (marker.totalDocs > 0) {
    return NextResponse.json(
      { error: 'This initialization link has already been used.' },
      { headers: noStoreHeaders, status: 410 },
    )
  }

  const users = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    req: baseReq,
    sort: 'createdAt',
  })
  const bootstrapOwner = users.totalDocs === 1 ? users.docs[0] : undefined
  if (!bootstrapOwner || bootstrapOwner.role !== 'owner') {
    return NextResponse.json(
      { error: 'Initialization is no longer available for this project.' },
      { headers: noStoreHeaders, status: 410 },
    )
  }

  const email = parsed.data.email.toLowerCase()
  const existing = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req: baseReq,
    where: { email: { equals: email } },
  })
  if (existing.totalDocs > 0) {
    return NextResponse.json(
      { error: 'An account with this email already exists.' },
      { headers: noStoreHeaders, status: 409 },
    )
  }

  const ownerReq = await createLocalReq({ user: bootstrapOwner }, payload)
  let created: Awaited<ReturnType<typeof payload.create>> | undefined
  try {
    created = await payload.create({
      collection: 'users',
      data: {
        email,
        name: parsed.data.name,
        password: parsed.data.password,
        role: 'owner',
      },
      overrideAccess: true,
      req: ownerReq,
    })

    await payload.create({
      collection: 'audit-events',
      data: {
        action: 'admin.bootstrap.completed',
        actor: bootstrapOwner.id,
        entityId: String(created.id),
        entityType: 'system',
        metadata: { email },
        summary: 'Initial administrator created through the one-time setup link',
      },
      overrideAccess: true,
      req: ownerReq,
    })
  } catch (error) {
    if (created?.id != null) {
      try {
        await payload.delete({
          collection: 'users',
          id: created.id,
          overrideAccess: true,
          req: ownerReq,
        })
      } catch (rollbackError) {
        payload.logger.error({
          err: rollbackError,
          message: 'Unable to roll back failed administrator initialization',
        })
      }
    }
    payload.logger.error({
      err: error,
      message: 'Administrator initialization failed',
    })
    return NextResponse.json(
      { error: 'The account could not be created. Please try again.' },
      { headers: noStoreHeaders, status: 500 },
    )
  }

  return NextResponse.json(
    { loginPath: '/admin/login', ok: true },
    { headers: noStoreHeaders, status: 201 },
  )
}
