import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { service: 'international-trade-web', status: 'live', time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
