import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '../../../payload-types'
import { revalidateLocalizedContent } from '../../../utilities/revalidateLocalized'

export const revalidatePost: CollectionAfterChangeHook<Post> = ({
  doc,
  previousDoc,
  req,
}) => {
  if (!req.context.disableRevalidate) {
    revalidateLocalizedContent(req, 'post', doc.slug)
    if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
      revalidateLocalizedContent(req, 'post', previousDoc.slug)
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Post> = ({ doc, req }) => {
  if (!req.context.disableRevalidate) revalidateLocalizedContent(req, 'post', doc?.slug)

  return doc
}
