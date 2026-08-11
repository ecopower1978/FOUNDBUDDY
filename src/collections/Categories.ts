import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { editorOrOwner, ownerOnly } from '../access/roles'
import { slugField } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: editorOrOwner,
    delete: ownerOnly,
    read: anyone,
    update: editorOrOwner,
  },
  admin: {
    hidden: true,
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
