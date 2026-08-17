import { draftMode } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { isEnabled } = await draftMode()
  return NextResponse.json(
    { enabled: isEnabled },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
