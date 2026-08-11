'use client'

import { toast, useConfig, useLocale, useRouteCache, useSelection } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ProductBulkActions() {
  const { count, getSelectedIds, selectAll, toggleAll } = useSelection()
  const { config } = useConfig()
  const locale = useLocale()
  const { clearRouteCache } = useRouteCache()
  const router = useRouter()
  const [actionArea, setActionArea] = useState<Element | null>(null)
  const [isUnlisting, setIsUnlisting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    if (count === 0) {
      setActionArea(null)
      return
    }

    const actionAreas = document.querySelectorAll('.list-selection__actions')
    setActionArea(actionAreas.item(actionAreas.length - 1) || null)
  }, [count])

  if (!actionArea || count === 0) return null

  const unlistProducts = async () => {
    if (selectAll === 'allAvailable') {
      toast.error('请取消跨页全选，然后选择当前页面中的商品。')
      return
    }

    setIsUnlisting(true)
    const ids = getSelectedIds().map(Number).filter(Number.isFinite)
    setProgress({ done: 0, total: ids.length })

    try {
      let succeeded = 0
      const failed: Array<{ id: number; reason: string }> = []
      for (let start = 0; start < ids.length; start += 10) {
        const batch = ids.slice(start, start + 10)
        const response = await fetch(`${config.routes.api}/products/unlist`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch, locale: locale.code }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || 'Unable to unlist products')
        succeeded += Number(result?.summary?.succeeded || 0)
        failed.push(...(result?.failed || []))
        setProgress({ done: Math.min(start + batch.length, ids.length), total: ids.length })
      }

      if (failed.length) {
        toast.error(
          `已下架 ${succeeded} 个，${failed.length} 个失败。失败项可保持选中后安全重试。`,
        )
      } else {
        toast.success(`已下架 ${succeeded} 个商品`)
      }
      toggleAll()
      clearRouteCache()
      router.refresh()
    } catch {
      toast.error('下架失败，请稍后重试。')
    } finally {
      setIsUnlisting(false)
    }
  }

  return createPortal(
    <button
      aria-label="下架"
      className="list-selection__button"
      disabled={isUnlisting}
      onClick={unlistProducts}
      style={{ order: -1 }}
      type="button"
    >
      {isUnlisting ? `下架中 ${progress.done}/${progress.total}` : '批量下架'}
    </button>,
    actionArea,
  )
}
