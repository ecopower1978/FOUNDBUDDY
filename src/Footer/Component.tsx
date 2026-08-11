import { getMessages, type SiteLocale } from '@/i18n/config'
import { siteBrandName, siteContactEmail } from '@/config/siteVariant'
import { getCompany } from '@/data/company'

export async function Footer({ locale }: { locale: SiteLocale }) {
  const company = await getCompany(locale)
  const t = getMessages(locale)
  const brandName = company.brandName || siteBrandName
  const email = company.contact?.email || siteContactEmail
  return (
    <footer className="trade-footer">
      <div className="trade-shell trade-footer__grid">
        <div><strong>{brandName}</strong><p>{t.footerTagline}</p></div>
        <div><span>{t.explore}</span><a href={`/${locale}#products`}>{t.products}</a><a href={`/${locale}/posts`}>{t.insights}</a></div>
        <div><span>{t.company}</span><a href={`/${locale}#about`}>{t.aboutUs}</a><a href={`/${locale}#contact`}>{t.contact}</a></div>
        {email && <div><span>{t.salesEnquiry}</span><a href={`mailto:${email}`}>{email}</a>{company.contact?.phone && <p>{company.contact.phone}</p>}</div>}
      </div>
      <div className="trade-shell trade-footer__bottom">© {new Date().getFullYear()} {brandName}. {t.rights}</div>
    </footer>
  )
}
