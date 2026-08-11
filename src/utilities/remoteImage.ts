import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'

import sharp from 'sharp'
import type { Payload, PayloadRequest } from 'payload'

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
const MAX_INPUT_PIXELS = 40_000_000
const MAX_REDIRECTS = 3
const ALLOWED_MIME_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp'])

function isPrivateIPv4(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  )
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split('%')[0]
  if (isIP(normalized) === 4) return isPrivateIPv4(normalized)
  if (isIP(normalized) !== 6) return true
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  ) {
    return true
  }
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIPv4(mapped[1]) : false
}

function hostAllowed(hostname: string) {
  const rules = (process.env.AGENT_IMAGE_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (!rules.length) return process.env.NODE_ENV !== 'production'
  const host = hostname.toLowerCase()
  return rules.some((rule) =>
    rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host !== rule.slice(2) : host === rule,
  )
}

async function validateRemoteURL(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Cover image URL must be a public HTTP(S) URL')
  }
  if (!hostAllowed(url.hostname)) {
    throw new Error('Cover image host is not allowed')
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Cover image URL resolves to a private or reserved address')
  }
  return url
}

async function readLimitedBody(response: Response) {
  if (!response.body) throw new Error('Cover image response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel()
      throw new Error('Cover image exceeds 15 MB')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

async function downloadRemoteImage(input: string) {
  let url = await validateRemoteURL(input)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('Too many cover image redirects')
      url = await validateRemoteURL(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`Cover image server returned ${response.status}`)
    const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Unsupported cover image type')
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_DOWNLOAD_BYTES) throw new Error('Cover image exceeds 15 MB')
    return readLimitedBody(response)
  }
  throw new Error('Unable to download cover image')
}

export async function importAgentCoverImage({
  alt,
  locale,
  payload,
  req,
  url,
}: {
  alt: string
  locale: string
  payload: Payload
  req: PayloadRequest
  url: string
}) {
  const input = await downloadRemoteImage(url)
  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
  const metadata = await image.metadata()
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 12_000 ||
    metadata.height > 12_000 ||
    metadata.width * metadata.height > MAX_INPUT_PIXELS
  ) {
    throw new Error('Cover image pixel dimensions are too large')
  }
  const output = await image
    .rotate()
    .resize({ fit: 'inside', height: 4_000, width: 4_000, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()

  return payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data: output,
      mimetype: 'image/webp',
      name: `agent-cover-${randomUUID()}.webp`,
      size: output.length,
    },
    locale: locale as never,
    overrideAccess: true,
    req,
  })
}
