import { afterEach, describe, expect, it } from 'vitest'

import { resolveCustomerServiceConfig } from '@/customerService/config'

const environmentKeys = [
  'AI_CHAT_API_KEY',
  'AI_CHAT_API_URL',
  'AI_CHAT_AUTH_SCHEME',
] as const
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
)

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('customer service configuration resolution', () => {
  it('prefers the owner-managed global over environment values', () => {
    process.env.AI_CHAT_API_KEY = 'environment-key'
    process.env.AI_CHAT_API_URL = 'https://environment.example.test/chat'
    process.env.AI_CHAT_AUTH_SCHEME = 'bearer'

    expect(
      resolveCustomerServiceConfig({
        apiKey: 'admin-key',
        apiUrl: 'https://admin.example.test/chat',
        authScheme: 'x-api-key',
        enabled: true,
      }),
    ).toEqual({
      apiKey: 'admin-key',
      apiUrl: 'https://admin.example.test/chat',
      authScheme: 'x-api-key',
      enabled: true,
    })
  })

  it('keeps the environment fallback for blank admin fields', () => {
    process.env.AI_CHAT_API_KEY = 'environment-key'
    process.env.AI_CHAT_API_URL = 'https://environment.example.test/chat'
    process.env.AI_CHAT_AUTH_SCHEME = 'raw'

    expect(resolveCustomerServiceConfig({})).toEqual({
      apiKey: 'environment-key',
      apiUrl: 'https://environment.example.test/chat',
      authScheme: 'raw',
      enabled: true,
    })
  })

  it('allows the owner to disable the integration explicitly', () => {
    process.env.AI_CHAT_API_URL = 'https://environment.example.test/chat'

    expect(
      resolveCustomerServiceConfig({ enabled: false }),
    ).toMatchObject({
      apiUrl: 'https://environment.example.test/chat',
      enabled: false,
    })
  })
})
