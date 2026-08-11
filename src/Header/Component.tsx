import { siteBrandName } from '@/config/siteVariant'
import { getCompany } from '@/data/company'
import { getMessages, type SiteLocale } from '@/i18n/config'
import { HeaderNavigation } from './Navigation'

export async function Header({ locale }: { locale: SiteLocale }) {
  const company = await getCompany(locale)
  const t = getMessages(locale)
  const brandName = company.brandName || siteBrandName
  return (
    <header className="trade-header">
      <div className="trade-shell trade-header__inner">
        <a className="trade-brand" href={`/${locale}`}><span>{brandName.slice(0, 1)}</span><strong>{brandName}</strong></a>
        <HeaderNavigation
          labels={{
            closeMenu: t.closeMenu,
            company: t.company,
            contact: t.contact,
            insights: t.insights,
            language: t.language,
            menu: t.explore,
            products: t.products,
          }}
          locale={locale}
        />
      </div>
    </header>
  )
}
