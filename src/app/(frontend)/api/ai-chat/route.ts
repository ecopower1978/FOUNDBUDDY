import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { agentAuthHeaders, parseAgentResponse } from '@/customerService/agent'
import { getMessages, isSiteLocale, localeMeta } from '@/i18n/config'
import { consumeRateLimit, trustedClientKey } from '@/utilities/rateLimit'
import { getCustomerServiceConfig } from '@/utilities/getCustomerServiceConfig'

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1_200),
  sessionId: z.string().max(100).optional(),
  pageUrl: z.string().max(500).optional(),
  locale: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['assistant', 'user']),
        text: z.string().max(1_200),
      }),
    )
    .max(6)
    .optional(),
}).strict()

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 16_384) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 16_384) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }
  const parsed = bodySchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody)
      } catch {
        return null
      }
    })(),
  )
  const requestedLocale = parsed.success ? parsed.data.locale : undefined
  const locale = isSiteLocale(requestedLocale) ? requestedLocale : 'en'
  const t = getMessages(locale)
  if (!parsed.success) {
    return NextResponse.json({ error: t.questionTooLong }, { status: 400 })
  }
  let rateLimit: Awaited<ReturnType<typeof consumeRateLimit>>
  try {
    rateLimit = await consumeRateLimit({
      key: `ai:${trustedClientKey(request.headers)}`,
      limit: 15,
      windowSeconds: 60,
    })
  } catch {
    return NextResponse.json({ error: t.chatUnavailable }, { status: 503 })
  }
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: t.tooMany }, { status: 429 })
  }

  const customerService = await getCustomerServiceConfig()
  if (!customerService.enabled || !customerService.apiUrl) {
    return NextResponse.json({ answer: t.aiConnecting })
  }

  const context = {
    mode: 'customer_service',
    responseLanguage: localeMeta[locale].label,
    rules: [
      'Answer as a concise international-trade product assistant.',
      'Never invent price, certification, inventory or delivery promises.',
      'When information is missing, ask for product name, quantity and destination country.',
      'Suggest contacting the sales team for a confirmed quotation.',
    ],
    currentPage: parsed.data.pageUrl || `/${locale}`,
    recentMessages: (parsed.data.history || []).slice(-6),
    customerQuestion: parsed.data.message,
  }

  try {
    const upstream = await fetch(customerService.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...agentAuthHeaders(customerService.apiKey, customerService.authScheme),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: JSON.stringify(context) }],
        sessionId: parsed.data.sessionId || crypto.randomUUID(),
        source: 'api',
        extra: {},
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const raw = await upstream.text()
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`)
    const answer = parseAgentResponse(raw, upstream.headers.get('content-type') || '')
    if (!answer.trim()) throw new Error('Empty assistant response')
    return NextResponse.json({ answer: answer.trim() })
  } catch {
    return NextResponse.json({ error: t.chatUnavailable }, { status: 502 })
  }
}
