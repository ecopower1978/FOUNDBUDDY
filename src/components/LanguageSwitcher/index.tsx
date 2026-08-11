'use client'

import { Check, ChevronDown, Globe2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { localeNames, locales, type SiteLocale } from '@/i18n/config'

export function LanguageSwitcher({ locale, label }: { locale: SiteLocale; label: string }) {
  const [value, setValue] = useState(locale)
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    setValue(locale)
  }, [locale])

  useEffect(() => {
    if (!isOpen) return
    optionRefs.current[locales.indexOf(value)]?.focus()
  }, [isOpen, value])

  function changeLocale(nextLocale: SiteLocale) {
    setValue(nextLocale)
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `site-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    window.localStorage.setItem('site-locale', nextLocale)
    window.dispatchEvent(new CustomEvent('site-locale-change', { detail: nextLocale }))
    setIsOpen(false)
    triggerRef.current?.focus()
    const segments = pathname.split('/').filter(Boolean)
    if (isSiteLocaleSegment(segments[0])) segments[0] = nextLocale
    else segments.unshift(nextLocale)
    router.push(`/${segments.join('/')}${window.location.search}${window.location.hash}`)
  }

  function moveFocus(event: React.KeyboardEvent, index: number) {
    let target = index
    if (event.key === 'ArrowDown') target = (index + 1) % locales.length
    else if (event.key === 'ArrowUp') target = (index - 1 + locales.length) % locales.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = locales.length - 1
    else return
    event.preventDefault()
    optionRefs.current[target]?.focus()
  }

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        className="language-switcher__trigger"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <Globe2 aria-hidden="true" size={16} />
        <span>{localeNames[value]}</span>
        <ChevronDown aria-hidden="true" className={isOpen ? 'is-open' : ''} size={15} />
      </button>

      {isOpen && (
        <div
          aria-label={label}
          className="language-switcher__menu"
          id={menuId}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false)
            }
          }}
          role="listbox"
        >
          {locales.map((item, index) => (
            <button
              aria-selected={item === value}
              className={item === value ? 'is-selected' : ''}
              key={item}
              onClick={() => changeLocale(item)}
              onKeyDown={(event) => moveFocus(event, index)}
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              role="option"
              type="button"
            >
              <span dir="auto">{localeNames[item]}</span>
              <Check aria-hidden="true" size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function isSiteLocaleSegment(value?: string): value is SiteLocale {
  return Boolean(value && locales.includes(value as SiteLocale))
}
