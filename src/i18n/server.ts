import 'server-only'

import { cookies, headers } from 'next/headers'

import { isSiteLocale, type SiteLocale } from './config'

const COUNTRY_LOCALES: Partial<Record<string, SiteLocale>> = {
  AD: 'es', AR: 'es', BO: 'es', CL: 'es', CO: 'es', CR: 'es', CU: 'es', DO: 'es', EC: 'es', ES: 'es',
  GT: 'es', HN: 'es', MX: 'es', NI: 'es', PA: 'es', PE: 'es', PR: 'es', PY: 'es', SV: 'es', UY: 'es', VE: 'es',
  AE: 'ar', BH: 'ar', DZ: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', LB: 'ar', LY: 'ar', MA: 'ar',
  MR: 'ar', OM: 'ar', PS: 'ar', QA: 'ar', SA: 'ar', SD: 'ar', SO: 'ar', SY: 'ar', TN: 'ar', YE: 'ar',
  AT: 'de', DE: 'de', LI: 'de',
  IL: 'he',
  KR: 'ko', KP: 'ko',
  AO: 'pt', BR: 'pt', CV: 'pt', GW: 'pt', MZ: 'pt', PT: 'pt', ST: 'pt', TL: 'pt',
  CN: 'zh-CN', SG: 'zh-CN',
  HK: 'zh-TW', MO: 'zh-TW', TW: 'zh-TW',
}

export function mapCountryToLocale(country?: string | null): SiteLocale {
  return COUNTRY_LOCALES[country?.trim().toUpperCase() || ''] || 'en'
}

export function localeFromAcceptLanguage(value: string | null): SiteLocale | null {
  if (!value) return null
  const requested = value
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter(Boolean)

  for (const language of requested) {
    const normalized = language.toLowerCase()
    if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-hant') return 'zh-TW'
    if (normalized.startsWith('zh')) return 'zh-CN'
    const direct = ['en', 'es', 'ar', 'de', 'he', 'ko', 'pt'].find((code) => normalized.startsWith(code))
    if (direct) return direct as SiteLocale
  }
  return null
}

export async function getSiteLocale(): Promise<SiteLocale> {
  const headerList = await headers()
  const routeLocale = headerList.get('x-site-locale')
  if (isSiteLocale(routeLocale)) return routeLocale

  const cookieLocale = (await cookies()).get('site-locale')?.value
  if (isSiteLocale(cookieLocale)) return cookieLocale

  return localeFromAcceptLanguage(headerList.get('accept-language')) || 'en'
}
