import { redirect } from 'next/navigation'

import { getSiteLocale } from '@/i18n/server'

export default async function RootPage() {
  redirect(`/${await getSiteLocale()}`)
}

