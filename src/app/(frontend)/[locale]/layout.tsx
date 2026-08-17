import { notFound } from 'next/navigation'

import { AIChat } from '@/components/AIChat'
import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
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
  const documentAttributesScript = `document.documentElement.dir=${JSON.stringify(documentLocale.dir)};document.documentElement.lang=${JSON.stringify(documentLocale.htmlLang)}`

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: documentAttributesScript }} />
      <div dir={documentLocale.dir} lang={documentLocale.htmlLang}>
        <AdminBar />
        <Header locale={locale} />
        {children}
        <Footer locale={locale} />
        <AIChat initialLocale={locale} />
      </div>
    </>
  )
}
