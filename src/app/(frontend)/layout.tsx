import type { Metadata } from 'next'

import { cn } from '@/utilities/ui'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import React from 'react'

import { env } from '@/config/env'
import { isSiteLocale, localeMeta } from '@/i18n/config'
import { getSiteLocale } from '@/i18n/server'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'

import './globals.css'
import { siteBrandName } from '@/config/siteVariant'

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale?: string }>
}) {
  const routeLocale = (await params).locale
  // The locale segment is a child of this route-group layout, so Next does not
  // pass it through `params` here. The proxy supplies x-site-locale for every
  // localized request; getSiteLocale reads that header before cookie/browser
  // preferences and keeps the document root in sync with the page.
  const locale = isSiteLocale(routeLocale) ? routeLocale : await getSiteLocale()

  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable)}
      dir={localeMeta[locale].dir}
      lang={localeMeta[locale].htmlLang}
      suppressHydrationWarning
    >
      <head>
        <InitTheme />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  title: {
    default: siteBrandName,
    template: `%s | ${siteBrandName}`,
  },
  description: 'Products, sourcing and export support for international buyers.',
  metadataBase: new URL(env.siteURL),
  openGraph: {
    description: 'Products, sourcing and export support for international buyers.',
    images: [{ url: '/og.png' }],
    siteName: siteBrandName,
    title: siteBrandName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
    title: siteBrandName,
  },
}
