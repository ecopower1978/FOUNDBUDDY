import { getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { randomBytes } from 'node:crypto'

export const testUser = {
  email: 'e2e-owner@example.test',
  password: process.env.E2E_TEST_PASSWORD ?? `E2E-${randomBytes(24).toString('base64url')}`,
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })
  const existing = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: testUser.email } },
  })

  if (existing.docs[0]) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { ...testUser, name: 'E2E Owner', role: 'owner' },
      overrideAccess: true,
    })
    return
  }

  const existingOwner = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    where: { role: { equals: 'owner' } },
  })

  if (existingOwner.docs[0]) {
    await payload.create({
      collection: 'users',
      data: { ...testUser, name: 'E2E Owner', role: 'owner' },
      overrideAccess: false,
      user: existingOwner.docs[0],
    })
    return
  }

  await payload.create({
    collection: 'users',
    data: { ...testUser, name: 'E2E Owner', role: 'owner' },
    overrideAccess: true,
  })
}
