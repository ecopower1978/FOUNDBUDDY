'use client'

import { Button } from '@payloadcms/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { isSiteTemplate, type SiteTemplate } from '@/config/siteTemplate'

const templateChoices: Array<{
  description: string
  key: SiteTemplate
  title: string
}> = [
  {
    description: '公司实力、信任内容与询盘路径优先。',
    key: 'trust',
    title: '信任权威型',
  },
  {
    description: '产品浏览、参数比较与采购入口优先。',
    key: 'catalog',
    title: '产品目录型',
  },
  {
    description: '案例能力、服务流程与项目询盘优先。',
    key: 'solution',
    title: '解决方案型',
  },
]

type TemplateResponse = {
  error?: string
  templateKey?: unknown
}

async function readResponse(response: Response): Promise<TemplateResponse> {
  const result = (await response.json().catch(() => ({}))) as TemplateResponse
  if (!response.ok) throw new Error(result.error || '模板设置读取失败。')
  return result
}

export function TemplateSwitcher() {
  const [currentTemplate, setCurrentTemplate] = useState<SiteTemplate | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<SiteTemplate>('trust')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'error' | 'success' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/site-template', { cache: 'no-store', signal: controller.signal })
      .then(readResponse)
      .then((result) => {
        if (!isSiteTemplate(result.templateKey)) throw new Error('模板设置返回值无效。')
        setCurrentTemplate(result.templateKey)
        setSelectedTemplate(result.templateKey)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setMessage(error instanceof Error ? error.message : '模板设置读取失败。')
        setMessageTone('error')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  const selectedChoice = templateChoices.find((choice) => choice.key === selectedTemplate)
  const currentChoice = templateChoices.find((choice) => choice.key === currentTemplate)
  const canSave = Boolean(currentTemplate && selectedTemplate !== currentTemplate && !saving)

  const saveTemplate = async () => {
    if (!canSave) return

    setSaving(true)
    setMessage(null)
    setMessageTone(null)
    try {
      const response = await fetch('/api/admin/site-template', {
        body: JSON.stringify({ templateKey: selectedTemplate }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      const result = await readResponse(response)
      if (!isSiteTemplate(result.templateKey)) throw new Error('模板设置返回值无效。')
      setCurrentTemplate(result.templateKey)
      setSelectedTemplate(result.templateKey)
      setMessage(`已切换为「${selectedChoice?.title || result.templateKey}」，前台缓存正在刷新。`)
      setMessageTone('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模板切换失败，请稍后重试。')
      setMessageTone('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="before-dashboard-template" className="before-dashboard__section">
      <div className="before-dashboard__template-header">
        <div>
          <h3 id="before-dashboard-template">前台展示风格</h3>
          <p>固定三选一，切换只改变页面呈现，不会改变商品、文章或素材数据。</p>
        </div>
        <Link className="before-dashboard__template-link" href="/admin/globals/site-settings">
          打开完整设置
        </Link>
      </div>

      {loading ? (
        <p className="before-dashboard__template-loading" role="status">
          正在读取当前模板…
        </p>
      ) : (
        <>
          <fieldset aria-label="选择前台模板" className="before-dashboard__template-options">
            <legend className="sr-only">选择前台模板</legend>
            {templateChoices.map((choice) => (
              <label className="before-dashboard__template-option" key={choice.key}>
                <input
                  checked={selectedTemplate === choice.key}
                  className="before-dashboard__template-option-input"
                  name="site-template"
                  onChange={() => {
                    setSelectedTemplate(choice.key)
                    setMessage(null)
                    setMessageTone(null)
                  }}
                  type="radio"
                  value={choice.key}
                />
                <span className="before-dashboard__template-option-body">
                  <span className="before-dashboard__template-option-title">
                    {choice.title}
                    {currentTemplate === choice.key && (
                      <span className="before-dashboard__template-badge">当前</span>
                    )}
                  </span>
                  <span className="before-dashboard__template-option-description">
                    {choice.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="before-dashboard__template-footer">
            <p
              aria-live="polite"
              className={`before-dashboard__template-status${messageTone === 'error' ? ' is-error' : ''}`}
              role="status"
            >
              {message || `当前前台：${currentChoice?.title || '未读取'}`}
            </p>
            <Button
              buttonStyle="primary"
              className="before-dashboard__template-save"
              disabled={!canSave}
              onClick={saveTemplate}
            >
              {saving ? '正在保存…' : '保存并切换'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
