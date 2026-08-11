import configPromise from '@payload-config'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { getMessages, isSiteLocale, localeMeta, locales } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type BlogPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function BlogPage({ params, searchParams }: BlogPageProps) {
  const localeParam = (await params).locale
  const locale = isSiteLocale(localeParam) ? localeParam : 'en'
  const requestedPage = Number((await searchParams).page || 1)
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const t = getMessages(locale)
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    locale,
    fallbackLocale: ['en', 'zh-CN'],
    depth: 1,
    limit: 12,
    page,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })
  if (posts.totalPages > 0 && page > posts.totalPages) notFound()

  return (
    <main className="blog-index">
      <div className="trade-shell">
        <Link className="blog-index__back" href={`/${locale}`}>
          <ArrowLeft size={16} /> {t.backWebsite}
        </Link>
        <div className="blog-index__heading">
          <p className="trade-kicker">{t.insights}</p>
          <h1>{t.blogTitle}</h1>
          <p>{t.blogIntro}</p>
        </div>
        {posts.docs.length ? (
          <div className="trade-blog__grid">
            {posts.docs.map((post) => (
              <Link
                className="trade-blog__card"
                href={`/${locale}/posts/${post.slug}`}
                key={post.id}
              >
                <time>
                  {post.publishedAt
                    ? new Date(post.publishedAt).toLocaleDateString(
                        localeMeta[locale].htmlLang,
                        { day: 'numeric', month: 'short', year: 'numeric' },
                      )
                    : t.latestArticle}
                </time>
                <h2>{post.title}</h2>
                <p>{post.excerpt || post.meta?.description || t.articleFallback}</p>
                <span>
                  {t.readArticle} <ArrowRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="blog-index__empty">
            <h2>{t.noArticles}</h2>
            <p>{t.noArticlesText}</p>
          </div>
        )}
        {posts.totalPages > 1 && (
          <nav aria-label={t.blogTitle} className="blog-pagination">
            {posts.hasPrevPage ? (
              <Link href={`/${locale}/posts?page=${page - 1}`}>
                <ArrowLeft size={16} /> {page - 1}
              </Link>
            ) : (
              <span />
            )}
            <strong>
              {page} / {posts.totalPages}
            </strong>
            {posts.hasNextPage ? (
              <Link href={`/${locale}/posts?page=${page + 1}`}>
                {page + 1} <ArrowRight size={16} />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </main>
  )
}

export async function generateMetadata({
  params,
  searchParams,
}: BlogPageProps): Promise<Metadata> {
  const localeParam = (await params).locale
  const locale = isSiteLocale(localeParam) ? localeParam : 'en'
  const requestedPage = Number((await searchParams).page || 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 1 ? requestedPage : 1
  const suffix = page > 1 ? `?page=${page}` : ''
  return {
    title: getMessages(locale).insights,
    description: getMessages(locale).blogIntro,
    alternates: {
      canonical: `/${locale}/posts${suffix}`,
      languages: {
        ...Object.fromEntries(
          locales.map((item) => [localeMeta[item].htmlLang, `/${item}/posts${suffix}`]),
        ),
        'x-default': `/en/posts${suffix}`,
      },
    },
  }
}
