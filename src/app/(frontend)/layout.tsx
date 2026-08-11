import type { Metadata } from 'next'

import { cn } from '@/utilities/ui'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
import { env } from '@/config/env'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'
import { draftMode } from 'next/headers'

import './globals.css'
import { AIChat } from '@/components/AIChat'
import { localeMeta } from '@/i18n/config'
import { getSiteLocale } from '@/i18n/server'
import { siteBrandName } from '@/config/siteVariant'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()
  const locale = await getSiteLocale()

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
        <Providers>
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
          />

          <Header locale={locale} />
          {children}
          <Footer locale={locale} />
          <AIChat initialLocale={locale} />
        </Providers>
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
