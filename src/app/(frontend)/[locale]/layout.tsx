import { notFound } from 'next/navigation'

import { isSiteLocale } from '@/i18n/config'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  if (!isSiteLocale((await params).locale)) notFound()
  return children
}

