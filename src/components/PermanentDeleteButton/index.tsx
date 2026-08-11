'use client'

import { toast, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import './index.scss'

export default function PermanentDeleteButton() {
  const { collectionSlug, currentEditor, id, initialData } = useDocumentInfo()
  const { config } = useConfig()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  if (
    !id ||
    !['products', 'posts'].includes(collectionSlug || '') ||
    typeof currentEditor !== 'object' ||
    currentEditor?.role !== 'owner'
  ) {
    return null
  }

  const title = String(initialData?.title || '')
  const permanentlyDelete = async () => {
    const confirmation = window.prompt(
      `此操作不可恢复。请输入完整名称以确认永久删除：\n${title}`,
    )
    if (confirmation === null) return
    if (confirmation !== title) {
      toast.error('输入的名称不一致，未执行删除。')
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`${config.routes.api}/admin/permanent-delete`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collectionSlug, id, title }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || '删除失败')
      toast.success('内容已永久删除。')
      router.push(`/admin/collections/${collectionSlug}`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试。')
      setDeleting(false)
    }
  }

  return (
    <button
      className="permanent-delete-button"
      disabled={deleting}
      onClick={permanentlyDelete}
      type="button"
    >
      {deleting ? '正在永久删除…' : '永久删除'}
    </button>
  )
}
