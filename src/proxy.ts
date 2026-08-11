import { NextRequest, NextResponse } from 'next/server'

import { isSiteLocale, type SiteLocale } from '@/i18n/config'
const COUNTRY_LOCALES: Partial<Record<string, SiteLocale>> = {
  AR: 'es', BR: 'pt', CN: 'zh-CN', DE: 'de', ES: 'es', HK: 'zh-TW',
  IL: 'he', KR: 'ko', MX: 'es', PT: 'pt', SA: 'ar', SG: 'zh-CN', TW: 'zh-TW',
}

function mapCountry(country: string): SiteLocale {
  return COUNTRY_LOCALES[country.toUpperCase()] || 'en'
}

function localeFromHeader(value: string | null): SiteLocale | null {
  const requested = (value || '').split(',').map((item) => item.split(';')[0]?.trim().toLowerCase())
  for (const language of requested) {
    if (language === 'zh-tw' || language === 'zh-hk' || language === 'zh-hant') return 'zh-TW'
    if (language?.startsWith('zh')) return 'zh-CN'
    const direct = ['en', 'es', 'ar', 'de', 'he', 'ko', 'pt'].find((code) => language?.startsWith(code))
    if (direct) return direct as SiteLocale
  }
  return null
}

function preferredLocale(request: NextRequest): SiteLocale {
  const cookieLocale = request.cookies.get('site-locale')?.value
  if (isSiteLocale(cookieLocale)) return cookieLocale

  const country =
    process.env.TRUST_PROXY_HEADERS === 'true'
      ? request.headers.get('x-vercel-ip-country') ||
        request.headers.get('cf-ipcountry') ||
        request.headers.get('cloudfront-viewer-country')
      : null
  if (country && country !== 'XX') return mapCountry(country)

  return localeFromHeader(request.headers.get('accept-language')) || 'en'
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    const destination = request.nextUrl.clone()
    destination.pathname = `/${preferredLocale(request)}`
    return NextResponse.redirect(destination, 307)
  }

  if (pathname === '/posts' || pathname.startsWith('/posts/')) {
    const destination = request.nextUrl.clone()
    destination.pathname = `/en${pathname}`
    return NextResponse.redirect(destination, 308)
  }
  if (pathname.startsWith('/products/')) {
    const destination = request.nextUrl.clone()
    destination.pathname = `/en${pathname}`
    return NextResponse.redirect(destination, 308)
  }

  const locale = pathname.split('/')[1]
  if (isSiteLocale(locale)) {
    const headers = new Headers(request.headers)
    headers.set('x-site-locale', locale)
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|admin|_next|robots.txt|sitemap.*\\.xml|.*\\..*).*)'],
}
