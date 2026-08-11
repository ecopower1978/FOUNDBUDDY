'use client'

import { Button, toast, useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

export default function TranslationRetryButton() {
  const { collectionSlug, globalSlug, id, initialData } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const collection =
    globalSlug === 'company'
      ? 'company'
      : collectionSlug === 'products' || collectionSlug === 'posts'
        ? collectionSlug
        : null

  if (!collection) return null

  const manualLocales = Array.isArray(initialData?.translationStatus)
    ? initialData.translationStatus.flatMap((item) =>
        item && typeof item === 'object' && item.mode === 'manual' && item.locale
          ? [String(item.locale)]
          : [],
      )
    : []

  const retry = async (unlockLocale?: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/translations/retry', {
        body: JSON.stringify({ collection, id, unlockLocale }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || '重新提交失败')
      toast.success(
        unlockLocale
          ? `${unlockLocale} 已解除手工锁定并重新进入翻译队列。`
          : '失败的自动译文已重新进入队列。',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重新提交失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Button
        buttonStyle="secondary"
        disabled={loading || (!id && collection !== 'company')}
        onClick={() => retry()}
        size="small"
      >
        {loading ? '正在提交…' : '重新翻译失败语言'}
      </Button>
      {manualLocales.map((locale) => (
        <Button
          buttonStyle="secondary"
          disabled={loading}
          key={locale}
          onClick={() => retry(locale)}
          size="small"
        >
          解除 {locale} 手工锁定并重译
        </Button>
      ))}
    </div>
  )
}
