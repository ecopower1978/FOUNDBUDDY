import type { Metadata } from 'next'

import InitializeForm from './InitializeForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Create administrator',
}

export default function AdminInitializePage() {
  return <InitializeForm />
}
