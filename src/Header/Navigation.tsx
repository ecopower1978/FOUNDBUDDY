'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import type { SiteLocale } from '@/i18n/config'

type Labels = {
  closeMenu: string
  company: string
  contact: string
  insights: string
  language: string
  menu: string
  products: string
}

export function HeaderNavigation({
  labels,
  locale,
}: {
  labels: Labels
  locale: SiteLocale
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const controls = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)
  const links = (
    <>
      <Link href={`/${locale}#products`} onClick={close}>{labels.products}</Link>
      <Link href={`/${locale}#about`} onClick={close}>{labels.company}</Link>
      <Link href={`/${locale}/posts`} onClick={close}>{labels.insights}</Link>
      <LanguageSwitcher label={labels.language} locale={locale} />
      <Link className="trade-header__contact" href={`/${locale}#contact`} onClick={close}>
        {labels.contact}
      </Link>
    </>
  )

  return (
    <>
      <nav aria-label={labels.menu} className="trade-header__desktop-nav">{links}</nav>
      <button
        aria-controls="mobile-navigation"
        aria-expanded={open}
        aria-label={open ? labels.closeMenu : labels.menu}
        className="trade-header__menu-button"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        {open ? <X /> : <Menu />}
      </button>
      {open && (
        <>
          <button
            aria-label={labels.closeMenu}
            className="trade-header__backdrop"
            onClick={close}
            type="button"
          />
          <div
            aria-modal="true"
            className="trade-header__mobile-panel"
            id="mobile-navigation"
            aria-label={labels.menu}
            ref={panelRef}
            role="dialog"
          >
            <nav aria-label={labels.menu}>{links}</nav>
          </div>
        </>
      )}
    </>
  )
}
