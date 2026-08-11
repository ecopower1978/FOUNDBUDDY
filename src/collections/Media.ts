import { APIError, type CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { anyone } from '../access/anyone'
import { editorOrOwner, isEditorOrOwner, ownerOnly } from '../access/roles'
import { adminText as tr } from '../i18n/admin'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: tr('Image', '图片', 'Imagen'), plural: tr('Image library', '素材库', 'Biblioteca de imágenes') },
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  defaultSort: '-createdAt',
  lockDocuments: false,
  access: {
    create: editorOrOwner,
    delete: ownerOnly,
    read: anyone,
    update: editorOrOwner,
  },
  admin: {
    group: tr('Website content', '网站内容', 'Contenido del sitio'),
    defaultColumns: ['filename', 'updatedAt'],
    hideAPIURL: true,
    description: tr('Previously uploaded images can be reused here.', '集中查看和重复使用已经上传过的图片。', 'Consulte y reutilice aquí las imágenes ya subidas.'),
  },
  fields: [
    {
      name: 'migrationKey',
      type: 'text',
      unique: true,
      index: true,
      access: {
        create: () => false,
        read: ({ req }) => isEditorOrOwner(req),
        update: () => false,
      },
      admin: { hidden: true },
    },
    {
      name: 'alt',
      label: tr('Image description', '图片说明', 'Descripción de imagen'),
      type: 'text',
      localized: true,
      required: true,
      admin: {
        description: tr(
          'Describe the image for screen readers and search engines.',
          '请简要描述图片内容，供读屏软件和搜索引擎使用。',
          'Describa la imagen para lectores de pantalla y buscadores.',
        ),
      },
    },
    {
      name: 'caption',
      type: 'richText',
      localized: true,
      admin: {
        hidden: true,
      },
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [
          ...rootFeatures,
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const file = req.file
        if (file && file.size > 15 * 1024 * 1024) {
          throw new APIError('图片不能超过 15 MB。', 400)
        }
        if ((data?.width && data.width > 12000) || (data?.height && data.height > 12000)) {
          throw new APIError('图片像素尺寸不能超过 12000 × 12000。', 400)
        }
        return data
      },
    ],
  },
  upload: {
    // Upload to the public/media directory in Next.js making them publicly accessible even outside of Payload
    staticDir: path.resolve(dirname, '../../public/media'),
    adminThumbnail: 'thumbnail',
    crop: false,
    constructorOptions: {
      limitInputPixels: 40_000_000,
    },
    focalPoint: false,
    formatOptions: {
      format: 'webp',
      options: { quality: 85 },
    },
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    pasteURL: false,
    resizeOptions: {
      fit: 'inside',
      height: 4000,
      width: 4000,
      withoutEnlargement: true,
    },
    imageSizes: [
      {
        name: 'thumbnail',
        width: 300,
      },
      {
        name: 'square',
        width: 500,
        height: 500,
      },
      {
        name: 'small',
        width: 600,
      },
      {
        name: 'medium',
        width: 900,
      },
      {
        name: 'large',
        width: 1400,
      },
      {
        name: 'xlarge',
        width: 1920,
      },
      {
        name: 'og',
        width: 1200,
        height: 630,
        crop: 'center',
      },
    ],
  },
}
