import { ArrowLeft, ArrowRight, PackageCheck } from 'lucide-react'
import type { SiteLocale } from '@/i18n/config'
import Link from 'next/link'

import { TemplateProductCard, type TemplateProduct } from './HomeTemplates'

type ProductDirectoryLabels = {
  back: string
  category: string
  empty: string
  image: string
  intro: string
  title: string
  requestDetails: string
}

export function ProductDirectory({
  categories,
  labels,
  locale,
  products,
}: {
  categories: string[]
  labels: ProductDirectoryLabels
  locale: SiteLocale
  products: TemplateProduct[]
}) {
  return (
    <main className="product-directory">
      <div className="trade-shell">
        <Link className="product-directory__back" href={`/${locale}`}>
          <ArrowLeft size={16} /> {labels.back}
        </Link>
        <div className="product-directory__heading">
          <div>
            <p className="trade-kicker">{labels.category}</p>
            <h1>{labels.title}</h1>
          </div>
          <p>{labels.intro}</p>
        </div>
        <div className="product-directory__meta">
          <span>{products.length} {labels.category}</span>
          {categories.map((category) => <span key={category}>{category}</span>)}
        </div>
        {products.length ? (
          <div className="product-directory__grid">
            {products.map((product) => (
              <TemplateProductCard
                key={product.id}
                labels={{ image: labels.image, requestDetails: labels.requestDetails }}
                locale={locale}
                product={product}
              />
            ))}
          </div>
        ) : (
          <div className="product-directory__empty">
            <PackageCheck size={38} />
            <p>{labels.empty}</p>
          </div>
        )}
        <Link className="product-directory__home-link" href={`/${locale}`}>
          {labels.back} <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  )
}
