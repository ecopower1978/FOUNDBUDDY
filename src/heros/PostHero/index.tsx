import type { Post } from '@/payload-types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getMessages, localeMeta, type SiteLocale } from '@/i18n/config'

export const PostHero = ({ locale, post }: { locale: SiteLocale; post: Post }) => {
  const t = getMessages(locale)
  return (
    <header className="post-hero">
      <div className="trade-shell post-hero__inner">
        <Link href={`/${locale}/posts`}><ArrowLeft size={16} /> {t.allInsights}</Link>
        <p className="trade-kicker">{t.insightLabel}</p>
        <h1>{post.title}</h1>
        {post.excerpt && <p className="post-hero__excerpt">{post.excerpt}</p>}
        {post.publishedAt && <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString(localeMeta[locale].htmlLang, { month: 'long', day: 'numeric', year: 'numeric' })}</time>}
      </div>
    </header>
  )
}
