'use client'

import { PackageCheck } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'

type ProductImage = {
  alt: string
  url: string
}

export function ProductGallery({
  images,
  placeholder,
}: {
  images: ProductImage[]
  placeholder: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeImage = images[activeIndex]

  return (
    <div className="product-detail__gallery">
      <div className="product-detail__main-image">
        {activeImage ? (
          <Image
            alt={activeImage.alt}
            fill
            priority={activeIndex === 0}
            sizes="(max-width: 768px) 100vw, 50vw"
            src={activeImage.url}
          />
        ) : (
          <div className="product-detail__placeholder">
            <PackageCheck size={52} />
            <span>{placeholder}</span>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div aria-label={placeholder} className="product-detail__thumbnails">
          {images.map((image, index) => (
            <button
              aria-label={`${placeholder} ${index + 1}`}
              aria-pressed={index === activeIndex}
              className={index === activeIndex ? 'is-active' : undefined}
              key={`${image.url}-${index}`}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <Image alt="" fill sizes="84px" src={image.url} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
