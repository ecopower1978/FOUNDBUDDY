'use client'

import { Bot, LoaderCircle, MessageCircle, Send, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'

import { getMessages, isSiteLocale, type SiteLocale } from '@/i18n/config'

type ChatMessage = {
  role: 'assistant' | 'user'
  text: string
}

export function AIChat({ initialLocale }: { initialLocale: SiteLocale }) {
  const [open, setOpen] = useState(false)
  const [locale, setLocale] = useState(initialLocale)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: getMessages(initialLocale).chatWelcome }])
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const sessionRef = useRef('')
  const t = getMessages(locale)

  useEffect(() => {
    sessionRef.current = window.localStorage.getItem('trade-chat-session') || crypto.randomUUID()
    window.localStorage.setItem('trade-chat-session', sessionRef.current)
    const openButtons = document.querySelectorAll('[data-open-chat="true"]')
    const openChat = (event: Event) => {
      returnFocusRef.current = event.currentTarget as HTMLElement
      setOpen(true)
    }
    const changeLocale = (event: Event) => {
      const nextLocale = (event as CustomEvent).detail
      if (!isSiteLocale(nextLocale)) return
      setLocale(nextLocale)
      setMessages((current) => current.length === 1 && current[0]?.role === 'assistant'
        ? [{ role: 'assistant', text: getMessages(nextLocale).chatWelcome }]
        : current)
    }
    openButtons.forEach((button) => button.addEventListener('click', openChat))
    window.addEventListener('site-locale-change', changeLocale)
    return () => {
      openButtons.forEach((button) => button.removeEventListener('click', openChat))
      window.removeEventListener('site-locale-change', changeLocale)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const fallbackFocus = toggleRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const controls = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
      queueMicrotask(() => (returnFocusRef.current || fallbackFocus)?.focus())
    }
  }, [open])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages, loading])

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    setInput('')
    setMessages((current) => [...current, { role: 'user', text: message }])
    setLoading(true)

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: sessionRef.current,
          pageUrl: window.location.pathname,
          locale,
          history: messages.slice(-6),
        }),
      })
      const data = (await response.json()) as { answer?: string; error?: string }
      if (!response.ok) throw new Error(data.error || t.chatUnavailable)
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: data.answer || t.chatUnavailable },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text:
            error instanceof Error
              ? error.message
              : t.chatUnavailable,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-chat">
      {open && (
        <section
          aria-labelledby="ai-chat-title"
          aria-modal="true"
          className="ai-chat__panel"
          ref={panelRef}
          role="dialog"
        >
          <header className="ai-chat__header">
            <span className="ai-chat__avatar"><Bot size={20} /></span>
            <span><strong id="ai-chat-title">{t.chatTitle}</strong><small>{t.chatReply}</small></span>
            <button aria-label={t.closeChat} onClick={() => setOpen(false)} type="button"><X size={19} /></button>
          </header>
          <div aria-live="polite" className="ai-chat__messages">
            {messages.map((message, index) => (
              <p className={`ai-chat__message ai-chat__message--${message.role}`} key={index}>
                {message.text}
              </p>
            ))}
            {loading && <p className="ai-chat__message ai-chat__message--assistant ai-chat__loading"><LoaderCircle size={16} /> {t.thinking}</p>}
            <div ref={endRef} />
          </div>
          <form className="ai-chat__form" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="ai-chat-input">{t.chatPlaceholder}</label>
            <input
              autoComplete="off"
              id="ai-chat-input"
              ref={inputRef}
              maxLength={1200}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t.chatPlaceholder}
              value={input}
            />
            <button aria-label={t.send} disabled={!input.trim() || loading} type="submit"><Send size={18} /></button>
          </form>
          <p className="ai-chat__notice">{t.chatNotice}</p>
        </section>
      )}
      <button
        aria-expanded={open}
        aria-label={open ? t.closeChat : t.openChat}
        className="ai-chat__toggle"
        onClick={() => {
          returnFocusRef.current = toggleRef.current
          setOpen((value) => !value)
        }}
        ref={toggleRef}
        type="button"
      >
        {open ? <X /> : <MessageCircle />}
        {!open && <span>{t.askAI}</span>}
      </button>
    </div>
  )
}
