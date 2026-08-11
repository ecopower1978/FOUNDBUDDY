import type { GlobalConfig } from 'payload'

import { editorOrOwner } from '../access/roles'
import { adminText as tr } from '../i18n/admin'
import {
  queueGlobalTranslation,
  translationFields,
} from '../i18n/translationWorkflow'
import { writeAuditEvent } from '../utilities/audit'
import { revalidateLocalizedContent } from '../utilities/revalidateLocalized'

export const Company: GlobalConfig = {
  slug: 'company',
  label: tr('Company details & contact', '公司资料与联系方式', 'Empresa y contacto'),
  access: {
    read: () => true,
    update: editorOrOwner,
  },
  admin: {
    group: tr('Website content', '网站内容', 'Contenido del sitio'),
    hideAPIURL: true,
    description: tr('Update the homepage company profile and contact details.', '集中修改首页公司介绍、邮箱、电话和地址。保存后网站自动更新。', 'Actualice el perfil de la empresa y los datos de contacto.'),
  },
  fields: [
    {
      name: 'brandName',
      label: tr('Company / brand name', '公司简称 / 品牌名', 'Empresa / marca'),
      type: 'text',
      required: true,
    },
    {
      name: 'heroTitle',
      label: tr('Homepage headline', '首页主标题', 'Título de inicio'),
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'heroDescription',
      label: tr('Homepage introduction', '首页简介', 'Introducción de inicio'),
      type: 'textarea',
      required: true,
      localized: true,
    },
    {
      name: 'aboutTitle',
      label: tr('Company profile title', '公司介绍标题', 'Título de empresa'),
      type: 'text',
      localized: true,
    },
    {
      name: 'aboutDescription',
      label: tr('Company description', '公司详细介绍', 'Descripción de la empresa'),
      type: 'textarea',
      localized: true,
    },
    {
      name: 'highlights',
      label: tr('Company advantages', '公司优势', 'Ventajas de la empresa'),
      type: 'array',
      maxRows: 4,
      admin: { initCollapsed: true },
      labels: { singular: tr('Advantage', '一项优势', 'Ventaja'), plural: tr('Advantages', '公司优势', 'Ventajas') },
      fields: [
        { name: 'title', label: tr('Title', '标题', 'Título'), type: 'text', required: true, localized: true },
        { name: 'description', label: tr('Description', '说明', 'Descripción'), type: 'textarea', required: true, localized: true },
      ],
    },
    {
      name: 'contact',
      label: tr('Contact details', '联系方式', 'Datos de contacto'),
      type: 'group',
      fields: [
        { name: 'email', label: tr('Sales email', '业务邮箱', 'Correo comercial'), type: 'email', required: true },
        { name: 'phone', label: tr('Phone / WhatsApp', '电话 / WhatsApp', 'Teléfono / WhatsApp'), type: 'text' },
        { name: 'address', label: tr('Company address', '公司地址', 'Dirección'), type: 'textarea', localized: true },
        {
          name: 'wechat',
          label: tr('WeChat ID (optional)', '微信号（选填）', 'WeChat (opcional)'),
          type: 'text',
        },
      ],
    },
    ...translationFields,
  ],
  hooks: {
    afterChange: [
      queueGlobalTranslation('company', 'translateCompany', (doc) => ({
        aboutDescription: doc.aboutDescription,
        aboutTitle: doc.aboutTitle,
        address: doc.contact?.address,
        heroDescription: doc.heroDescription,
        heroTitle: doc.heroTitle,
        highlights: doc.highlights,
      })),
      async ({ doc, req }) => {
        revalidateLocalizedContent(req, 'company')
        if (!req.context?.translationWorkflow) {
          await writeAuditEvent(req, {
            action: 'company.updated',
            entityType: 'company',
            summary: '更新公司资料与联系方式',
          })
        }
        return doc
      },
    ],
  },
}
