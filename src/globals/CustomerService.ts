import type { GlobalConfig } from 'payload'

import { ownerOnly } from '@/access/roles'
import type { CustomerServiceAuthScheme } from '@/customerService/config'
import { adminText as tr } from '@/i18n/admin'
import { writeAuditEvent } from '@/utilities/audit'

const validateApiUrl = (value: string | null | undefined) => {
  if (!value) return true

  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? true
      : '请输入 http 或 https 开头的接口地址。'
  } catch {
    return '请输入有效的客服 API 地址。'
  }
}

export const CustomerService: GlobalConfig = {
  slug: 'customer-service',
  label: tr('Customer service API', '客服 API 配置', 'API de atención al cliente'),
  access: {
    read: ownerOnly,
    update: ownerOnly,
  },
  admin: {
    group: tr('System settings', '系统设置', 'Configuración del sistema'),
    hideAPIURL: true,
    description: tr(
      'Configure the optional customer-service agent without changing environment variables.',
      '在后台配置客服接口，保存后无需修改环境变量即可切换服务。仅所有者可查看和修改 API 密钥。',
      'Configure el agente opcional de atención al cliente sin cambiar variables de entorno.',
    ),
    hidden: ({ user }) => user?.role !== 'owner',
  },
  fields: [
    {
      name: 'enabled',
      label: tr('Enable customer service', '启用客服接口', 'Activar atención al cliente'),
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: tr(
          'Turn this off to use the contact fallback even when an endpoint is configured.',
          '关闭后即使配置了接口地址，前台也会使用人工联系方式提示。',
          'Desactívelo para usar el contacto comercial aunque haya un endpoint configurado.',
        ),
      },
    },
    {
      name: 'apiUrl',
      label: tr('API URL', 'API 地址', 'URL de API'),
      type: 'text',
      maxLength: 2_000,
      validate: validateApiUrl,
      admin: {
        description: tr(
          'The POST endpoint used by the customer-service agent.',
          '客服代理使用的 POST 接口地址。留空时使用 AI_CHAT_API_URL。',
          'Endpoint POST utilizado por el agente de atención al cliente.',
        ),
        placeholder: 'https://agent.example.com/api/chat',
      },
    },
    {
      name: 'apiKey',
      label: tr('API key', 'API 密钥', 'Clave API'),
      type: 'text',
      maxLength: 4_000,
      admin: {
        autoComplete: 'new-password',
        description: tr(
          'Stored in the protected admin global and only used server-side. Leave blank to use AI_CHAT_API_KEY.',
          '密钥保存在受保护的后台配置中，仅在服务端使用。留空时使用 AI_CHAT_API_KEY。',
          'Se almacena en la configuración protegida y solo se usa en el servidor.',
        ),
      },
    },
    {
      name: 'authScheme',
      label: tr('Authentication scheme', '认证方式', 'Esquema de autenticación'),
      type: 'select',
      required: true,
      defaultValue: 'bearer' satisfies CustomerServiceAuthScheme,
      options: [
        { label: 'Bearer', value: 'bearer' },
        { label: 'Raw Authorization', value: 'raw' },
        { label: 'X-API-Key', value: 'x-api-key' },
        { label: 'None', value: 'none' },
      ],
      admin: {
        description: tr(
          'Choose how the API key is sent to the upstream service.',
          '选择向上游客服服务发送 API 密钥的方式。',
          'Elija cómo se envía la clave API al servicio externo.',
        ),
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        await writeAuditEvent(req, {
          action: 'customer_service.updated',
          entityType: 'customer-service',
          metadata: {
            apiKeyConfigured: Boolean(doc.apiKey),
            apiUrl: doc.apiUrl || null,
            authScheme: doc.authScheme || null,
            enabled: doc.enabled !== false,
          },
          summary: '更新客服 API 配置',
        })
        return doc
      },
    ],
  },
}
