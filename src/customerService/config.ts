export const customerServiceAuthSchemes = ['bearer', 'raw', 'x-api-key', 'none'] as const

export type CustomerServiceAuthScheme = (typeof customerServiceAuthSchemes)[number]

export type CustomerServiceSettings = {
  apiKey?: string | null
  apiUrl?: string | null
  authScheme?: CustomerServiceAuthScheme | null
  enabled?: boolean | null
}

export type ResolvedCustomerServiceConfig = {
  apiKey: string
  apiUrl: string
  authScheme: CustomerServiceAuthScheme
  enabled: boolean
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveAuthScheme(value: unknown): CustomerServiceAuthScheme {
  return customerServiceAuthSchemes.includes(value as CustomerServiceAuthScheme)
    ? (value as CustomerServiceAuthScheme)
    : 'bearer'
}

function getEnvironmentConfig(): ResolvedCustomerServiceConfig {
  const apiUrl = cleanString(process.env.AI_CHAT_API_URL)

  return {
    apiKey: cleanString(process.env.AI_CHAT_API_KEY),
    apiUrl,
    authScheme: resolveAuthScheme(process.env.AI_CHAT_AUTH_SCHEME),
    enabled: Boolean(apiUrl),
  }
}

/**
 * Resolve the runtime settings without exposing whether the values came from
 * the admin global or the environment fallback.
 */
export function resolveCustomerServiceConfig(
  settings?: CustomerServiceSettings | null,
): ResolvedCustomerServiceConfig {
  const environment = getEnvironmentConfig()
  const apiUrl = cleanString(settings?.apiUrl) || environment.apiUrl

  return {
    apiKey: cleanString(settings?.apiKey) || environment.apiKey,
    apiUrl,
    authScheme: resolveAuthScheme(settings?.authScheme || environment.authScheme),
    enabled: typeof settings?.enabled === 'boolean' ? settings.enabled : environment.enabled,
  }
}
