'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { isSiteLocale, localeMeta } from '@/i18n/config'

export function DocumentLocaleSync() {
  const pathname = usePathname()

  useEffect(() => {
    const locale = pathname.split('/').filter(Boolean)[0]
    if (!isSiteLocale(locale)) return

    document.documentElement.dir = localeMeta[locale].dir
    document.documentElement.lang = localeMeta[locale].htmlLang
  }, [pathname])

  return null
}
