'use client'

import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'
import { ArrowLeft, ArrowRight, ImageIcon, Pause, Play } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SiteLocale } from '@/i18n/config'

export type HeroAdProduct = {
  id: number | string
  title: string
  category: string
  shortDescription: string
  slug: string
  image: { alt: string; url: string } | null
}

type Props = {
  locale: SiteLocale
  products: HeroAdProduct[]
  labels: {
    image: string
    region: string
    requestDetails: string
  }
}

const controls: Record<SiteLocale, { previous: string; next: string; pause: string; play: string }> = {
  en: { previous: 'Previous advertisement', next: 'Next advertisement', pause: 'Pause carousel', play: 'Continue carousel' },
  es: { previous: 'Anuncio anterior', next: 'Anuncio siguiente', pause: 'Pausar carrusel', play: 'Continuar carrusel' },
  ar: { previous: 'الإعلان السابق', next: 'الإعلان التالي', pause: 'إيقاف العرض', play: 'متابعة العرض' },
  de: { previous: 'Vorherige Anzeige', next: 'Nächste Anzeige', pause: 'Karussell pausieren', play: 'Karussell fortsetzen' },
  he: { previous: 'המודעה הקודמת', next: 'המודעה הבאה', pause: 'השהיית הקרוסלה', play: 'המשך הקרוסלה' },
  ko: { previous: '이전 광고', next: '다음 광고', pause: '슬라이드 일시 정지', play: '슬라이드 계속' },
  pt: { previous: 'Anúncio anterior', next: 'Próximo anúncio', pause: 'Pausar carrossel', play: 'Continuar carrossel' },
  'zh-CN': { previous: '上一张商品广告', next: '下一张商品广告', pause: '暂停轮播', play: '继续轮播' },
  'zh-TW': { previous: '上一張產品廣告', next: '下一張產品廣告', pause: '暫停輪播', play: '繼續輪播' },
}

export function HeroProductCarousel({ labels, locale, products }: Props) {
  const isRTL = locale === 'ar' || locale === 'he'
  const autoplay = useRef(
    Autoplay({
      delay: 5000,
      playOnInit: false,
      stopOnFocusIn: true,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  )
  const [viewportRef, api] = useEmblaCarousel(
    {
      align: 'start',
      direction: isRTL ? 'rtl' : 'ltr',
      loop: products.length > 1,
    },
    [autoplay.current],
  )
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const updateState = useCallback(() => {
    if (api) setSelectedIndex(api.selectedScrollSnap())
  }, [api])

  useEffect(() => setIsReady(true), [])

  useEffect(() => {
    if (!api) return
    const autoplayPlugin = autoplay.current
    updateState()
    api.on('select', updateState).on('reInit', updateState)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      autoplayPlugin.play()
      setIsPlaying(true)
    }

    return () => {
      api.off('select', updateState).off('reInit', updateState)
      autoplayPlugin.stop()
    }
  }, [api, updateState])

  return (
    <div
      aria-label={labels.region}
      aria-roledescription="carousel"
      className={`hero-ad${isReady ? ' hero-ad--ready' : ''}`}
      role="region"
    >
      <div className="hero-ad__viewport" ref={viewportRef}>
        <div className="hero-ad__track">
          {products.map((product, index) => (
            <article
              aria-hidden={index === selectedIndex ? undefined : true}
              aria-label={`${index + 1} / ${products.length}: ${product.title}`}
              className="hero-ad__slide"
              key={product.id}
              role="group"
            >
              {product.image ? (
                <Image
                  alt={product.image.alt}
                  className="hero-ad__image"
                  fill
                  loading={index === 0 ? 'eager' : 'lazy'}
                  priority={index === 0}
                  sizes="(max-width: 768px) 100vw, 1200px"
                  src={product.image.url}
                />
              ) : (
                <div className="hero-ad__placeholder">
                  <ImageIcon size={70} />
                  <span>{labels.image}</span>
                </div>
              )}
              <div className="hero-ad__shade" />
              <div className="hero-ad__content">
                <p>{product.category}</p>
                <h2>{product.title}</h2>
                <span>{product.shortDescription}</span>
                <Link
                  href={`/${locale}/products/${encodeURIComponent(product.slug)}`}
                  tabIndex={index === selectedIndex ? 0 : -1}
                >
                  {labels.requestDetails} <ArrowRight size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      {isReady && products.length > 1 && (
        <>
          <div className="hero-ad__dots">
            {products.map((product, index) => (
              <button
                aria-current={index === selectedIndex ? 'true' : undefined}
                aria-label={`${index + 1} / ${products.length}: ${product.title}`}
                className={index === selectedIndex ? 'is-active' : ''}
                key={product.id}
                onClick={() => api?.scrollTo(index)}
                type="button"
              />
            ))}
          </div>
          <div className="hero-ad__arrows">
            <button
              aria-label={isPlaying ? controls[locale].pause : controls[locale].play}
              onClick={() => {
                if (isPlaying) autoplay.current.stop()
                else autoplay.current.play()
                setIsPlaying((value) => !value)
              }}
              type="button"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button aria-label={controls[locale].previous} onClick={() => api?.scrollPrev()} type="button">
              {isRTL ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
            </button>
            <button aria-label={controls[locale].next} onClick={() => api?.scrollNext()} type="button">
              {isRTL ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
