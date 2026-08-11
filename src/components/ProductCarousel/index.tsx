'use client'

import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'
import { ArrowLeft, ArrowRight, PackageCheck, Pause, Play } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SiteLocale } from '@/i18n/config'

export type CarouselProduct = {
  id: number | string
  title: string
  category: string
  shortDescription: string
  slug: string
  image: { alt: string; url: string } | null
}

type Props = {
  locale: SiteLocale
  products: CarouselProduct[]
  labels: { image: string; requestDetails: string; region: string }
}

const controls: Record<SiteLocale, { previous: string; next: string; pause: string; play: string }> = {
  en: { previous: 'Previous products', next: 'Next products', pause: 'Pause carousel', play: 'Continue carousel' },
  es: { previous: 'Productos anteriores', next: 'Productos siguientes', pause: 'Pausar carrusel', play: 'Continuar carrusel' },
  ar: { previous: 'المنتجات السابقة', next: 'المنتجات التالية', pause: 'إيقاف العرض', play: 'متابعة العرض' },
  de: { previous: 'Vorherige Produkte', next: 'Nächste Produkte', pause: 'Karussell pausieren', play: 'Karussell fortsetzen' },
  he: { previous: 'המוצרים הקודמים', next: 'המוצרים הבאים', pause: 'השהיית הקרוסלה', play: 'המשך הקרוסלה' },
  ko: { previous: '이전 제품', next: '다음 제품', pause: '슬라이드 일시 정지', play: '슬라이드 계속' },
  pt: { previous: 'Produtos anteriores', next: 'Produtos seguintes', pause: 'Pausar carrossel', play: 'Continuar carrossel' },
  'zh-CN': { previous: '上一组商品', next: '下一组商品', pause: '暂停轮播', play: '继续轮播' },
  'zh-TW': { previous: '上一組產品', next: '下一組產品', pause: '暫停輪播', play: '繼續輪播' },
}

export function ProductCarousel({ labels, locale, products }: Props) {
  const isRTL = locale === 'ar' || locale === 'he'
  const autoplay = useRef(
    Autoplay({ delay: 4500, playOnInit: false, stopOnFocusIn: true, stopOnInteraction: false, stopOnMouseEnter: true }),
  )
  const [viewportRef, api] = useEmblaCarousel(
    { align: 'start', containScroll: 'trimSnaps', direction: isRTL ? 'rtl' : 'ltr', loop: products.length > 2 },
    [autoplay.current],
  )
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])

  const updateState = useCallback(() => {
    if (!api) return
    setSelectedIndex(api.selectedScrollSnap())
    setScrollSnaps(api.scrollSnapList())
  }, [api])

  useEffect(() => {
    setIsReady(true)
  }, [])

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
    <div aria-label={labels.region} aria-roledescription="carousel" className={`product-carousel${isReady ? ' product-carousel--ready' : ''}`} role="region">
      <div className="product-carousel__viewport" ref={viewportRef}>
        <div className="product-carousel__track">
          {products.map((product) => (
            <div className="product-carousel__slide" key={product.id}>
              <Link className="product-card" href={`/${locale}/products/${encodeURIComponent(product.slug)}`}>
                <div className="product-card__media">
                  {product.image ? (
                    <Image
                      alt={product.image.alt}
                      fill
                      sizes="(max-width: 720px) 88vw, (max-width: 1100px) 45vw, 30vw"
                      src={product.image.url}
                    />
                  ) : (
                    <div className="product-card__placeholder"><PackageCheck size={34} /><span>{labels.image}</span></div>
                  )}
                </div>
                <div className="product-card__body">
                  <p>{product.category}</p>
                  <h3>{product.title}</h3>
                  <span>{product.shortDescription}</span>
                  <strong>{labels.requestDetails} <ArrowRight size={16} /></strong>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {isReady && scrollSnaps.length > 1 && (
        <div className="product-carousel__controls">
          <div className="product-carousel__dots">
            {scrollSnaps.map((_, index) => <button aria-current={index === selectedIndex ? 'true' : undefined} aria-label={`${index + 1} / ${scrollSnaps.length}`} className={index === selectedIndex ? 'is-active' : ''} key={index} onClick={() => api?.scrollTo(index)} type="button" />)}
          </div>
          <div className="product-carousel__arrows">
            <button
              aria-label={isPlaying ? controls[locale].pause : controls[locale].play}
              onClick={() => {
                if (isPlaying) autoplay.current.stop()
                else autoplay.current.play()
                setIsPlaying((value) => !value)
              }}
              type="button"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button aria-label={controls[locale].previous} onClick={() => api?.scrollPrev()} type="button">{isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}</button>
            <button aria-label={controls[locale].next} onClick={() => api?.scrollNext()} type="button">{isRTL ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}</button>
          </div>
        </div>
      )}
    </div>
  )
}
