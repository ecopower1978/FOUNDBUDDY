import { notFound } from 'next/navigation'

import { AIChat } from '@/components/AIChat'
import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
import { getPublicSiteTemplate } from '@/data/siteSettings'
import { isSiteLocale, localeMeta } from '@/i18n/config'

export const revalidate = 300

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const localeParam = (await params).locale
  if (!isSiteLocale(localeParam)) notFound()

  const locale = localeParam
  const documentLocale = localeMeta[locale]
  const template = await getPublicSiteTemplate()
  const documentAttributesScript = `document.documentElement.dir=${JSON.stringify(documentLocale.dir)};document.documentElement.lang=${JSON.stringify(documentLocale.htmlLang)}`

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: documentAttributesScript }} />
      <div
        className={`site-template site-template--${template}`}
        data-site-template={template}
        dir={documentLocale.dir}
        lang={documentLocale.htmlLang}
      >
        <AdminBar />
        <Header locale={locale} />
        {children}
        <Footer locale={locale} />
        <AIChat initialLocale={locale} />
      </div>
    </>
  )
}
