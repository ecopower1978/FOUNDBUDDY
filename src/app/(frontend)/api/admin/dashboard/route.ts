import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { isEditorOrOwner, isOwner } from '@/access/roles'
import { getCachedDashboardAudits, getCachedDashboardOverview } from '@/data/dashboard'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isEditorOrOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const owner = isOwner(req)
  const [overview, audits] = await Promise.all([
    getCachedDashboardOverview(),
    owner ? getCachedDashboardAudits() : Promise.resolve(null),
  ])

  return NextResponse.json({
    ...overview,
    audits,
    role: user?.role,
  })
}
