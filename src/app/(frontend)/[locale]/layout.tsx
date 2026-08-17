import { notFound } from 'next/navigation'

import { AIChat } from '@/components/AIChat'
import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
import { isSiteLocale } from '@/i18n/config'

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

  return (
    <>
      <AdminBar />
      <Header locale={locale} />
      {children}
      <Footer locale={locale} />
      <AIChat initialLocale={locale} />
    </>
  )
}
