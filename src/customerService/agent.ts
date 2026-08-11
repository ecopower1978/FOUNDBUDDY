import type { CustomerServiceAuthScheme } from './config'

function findText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(findText).filter(Boolean).join('')
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['answer', 'content', 'text', 'output', 'result', 'message']) {
    const found = findText(record[key])
    if (found) return found
  }
  return ''
}

export function parseAgentResponse(raw: string, contentType: string): string {
  if (contentType.includes('text/event-stream')) {
    return raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]')
      .map((line) => {
        try {
          return findText(JSON.parse(line))
        } catch {
          return line
        }
      })
      .join('')
  }

  try {
    return findText(JSON.parse(raw))
  } catch {
    return raw
  }
}

export function agentAuthHeaders(
  apiKey: string | undefined,
  authScheme: CustomerServiceAuthScheme,
): Record<string, string> {
  if (!apiKey) return {}

  switch (authScheme) {
    case 'raw':
      return { Authorization: apiKey }
    case 'x-api-key':
      return { 'X-API-Key': apiKey }
    case 'none':
      return {}
    default:
      return { Authorization: `Bearer ${apiKey}` }
  }
}
