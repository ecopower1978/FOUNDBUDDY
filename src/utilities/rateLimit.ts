import { createHash } from 'crypto'
import { createClient, type RedisClientType } from 'redis'

import { env } from '@/config/env'

let client: RedisClientType | null = null
let connecting: Promise<RedisClientType> | null = null
const developmentWindows = new Map<
  string,
  { count: number; resetAt: number; value?: string }
>()

async function getRedis() {
  if (!env.redisURL) return null
  if (client?.isReady) return client
  if (!connecting) {
    const next = createClient({ url: env.redisURL })
    next.on('error', () => undefined)
    connecting = next.connect().then(() => {
      client = next as RedisClientType
      return client
    }).catch((error) => {
      connecting = null
      throw error
    })
  }
  return connecting
}

export function trustedClientKey(headers: Headers): string {
  const trustProxy = process.env.TRUST_PROXY_HEADERS === 'true'
  const raw = trustProxy
    ? headers.get('cf-connecting-ip') ||
      headers.get('x-real-ip') ||
      headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : null
  return createHash('sha256').update(raw || 'local').digest('hex').slice(0, 32)
}

export async function consumeRateLimit({
  key,
  limit,
  windowSeconds,
}: {
  key: string
  limit: number
  windowSeconds: number
}) {
  const redis = await getRedis()
  if (redis) {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1_000))
    const redisKey = `rate:${key}:${bucket}`
    const count = await redis.incr(redisKey)
    if (count === 1) await redis.expire(redisKey, windowSeconds + 2)
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
  }

  const now = Date.now()
  for (const [entryKey, entry] of developmentWindows) {
    if (entry.resetAt <= now) developmentWindows.delete(entryKey)
  }
  if (developmentWindows.size > 1_000) developmentWindows.clear()
  const current = developmentWindows.get(key)
  if (!current || current.resetAt <= now) {
    developmentWindows.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1_000,
    })
    return { allowed: true, remaining: limit - 1 }
  }
  current.count += 1
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
  }
}

export async function redisPing() {
  const redis = await getRedis()
  return redis ? redis.ping() : 'development-no-redis'
}

export async function getIdempotencyValue(key: string) {
  const redis = await getRedis()
  return redis?.get(`idempotency:${key}`)
}

export async function setIdempotencyValue(
  key: string,
  value: string,
  ttlSeconds = 86_400,
) {
  const redis = await getRedis()
  if (redis) {
    await redis.set(`idempotency:${key}`, value, { EX: ttlSeconds })
    return
  }
  developmentWindows.set(`idempotency:${key}`, {
    count: 0,
    resetAt: Date.now() + ttlSeconds * 1_000,
    value,
  })
}

export async function claimIdempotencyKey(
  key: string,
  requestID: string,
  ttlSeconds = 86_400,
): Promise<{ acquired: boolean; value?: string }> {
  const redis = await getRedis()
  if (redis) {
    const redisKey = `idempotency:${key}`
    const acquired = await redis.set(redisKey, `pending:${requestID}`, {
      EX: ttlSeconds,
      NX: true,
    })
    if (acquired === 'OK') return { acquired: true }
    return { acquired: false, value: (await redis.get(redisKey)) || undefined }
  }

  const mapKey = `idempotency:${key}`
  const existing = developmentWindows.get(mapKey)
  if (existing?.resetAt && existing.resetAt > Date.now()) {
    return { acquired: false, value: existing.value }
  }
  developmentWindows.set(mapKey, {
    count: 0,
    resetAt: Date.now() + ttlSeconds * 1_000,
    value: `pending:${requestID}`,
  })
  return { acquired: true }
}

export async function releaseIdempotencyKey(key: string) {
  const redis = await getRedis()
  if (redis) await redis.del(`idempotency:${key}`)
  else developmentWindows.delete(`idempotency:${key}`)
}
