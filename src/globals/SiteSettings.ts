import { revalidatePath, revalidateTag } from 'next/cache.js'
import type { GlobalConfig } from 'payload'

import { ownerOnly } from '@/access/roles'
import { siteTemplateKeys, siteTemplateMeta, type SiteTemplate } from '@/config/siteTemplate'
import { adminText as tr } from '@/i18n/admin'
import { locales } from '@/i18n/config'
import { writeAuditEvent } from '@/utilities/audit'

const templateOptions = siteTemplateKeys.map((key) => ({
  label:
    key === 'trust'
      ? '信任权威型（Trust & Authority）'
      : key === 'catalog'
        ? '产品目录型（Catalog & Supply）'
        : '解决方案型（Solution Partner）',
  value: key,
})) satisfies Array<{ label: string; value: SiteTemplate }>

function revalidatePublicTemplates() {
  revalidateTag('global_site-settings', 'max')
  for (const locale of locales) {
    revalidatePath(`/${locale}`)
    revalidatePath(`/${locale}`, 'layout')
  }
}

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: tr('Frontend template style', '前台模板风格', 'Estilo de plantilla pública'),
  access: {
    read: ownerOnly,
    update: ownerOnly,
  },
  admin: {
    group: tr('System settings', '系统设置', 'Configuración del sistema'),
    hideAPIURL: true,
    description: tr(
      'Choose one of the three fixed public-site presentations. The content and admin remain shared.',
      '选择三套固定前台模板之一。三套模板共用同一份内容和管理后台，不会新增模板。',
      'Elija una de las tres presentaciones públicas fijas. El contenido y el panel siguen compartidos.',
    ),
    hidden: ({ user }) => user?.role !== 'owner',
  },
  fields: [
    {
      name: 'templateKey',
      label: tr('Public-site template', '前台展示模板', 'Plantilla pública'),
      type: 'select',
      required: true,
      defaultValue: 'trust' satisfies SiteTemplate,
      options: templateOptions,
      admin: {
        description: tr(
          'The selected presentation is used by every public locale and device size.',
          '保存后所有语言和桌面端、手机端前台都会使用这个模板。',
          'La presentación seleccionada se usa en todos los idiomas y tamaños públicos.',
        ),
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        revalidatePublicTemplates()
        await writeAuditEvent(req, {
          action: 'site_template.updated',
          entityType: 'site-settings',
          metadata: {
            templateKey: doc.templateKey,
            templateLabel: siteTemplateMeta[doc.templateKey as SiteTemplate]?.label,
          },
          summary: `切换前台模板：${doc.templateKey}`,
        })
        return doc
      },
    ],
  },
}
