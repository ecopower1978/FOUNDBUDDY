'use client'

import { Banner } from '@payloadcms/ui/elements/Banner'
import { useLocale } from '@payloadcms/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import './index.scss'

type DashboardData = {
  audits?: Array<{ action: string; at: string; id: number; summary: string }>
  quality: { contactMissing: boolean; missingImages: number }
  recent: Array<{ at: string; href: string; title: string; type: string }>
  role?: 'editor' | 'owner'
  stats: {
    draftProducts: number
    failedTranslations: number
    publishedPosts: number
    publishedProducts: number
    unlistedProducts: number
  }
}

const entries = [
  { description: '编辑、发布和下架商品。', href: '/admin/collections/products', title: '商品管理' },
  { description: '调整首页推荐商品顺序。', href: '/admin/globals/homepage', title: '首页商品排序' },
  { description: '撰写、预览和发布文章。', href: '/admin/collections/posts', title: '博客管理' },
  { description: '维护品牌和联系方式。', href: '/admin/globals/company', title: '公司资料与联系方式' },
  { description: '维护客服 API 连接信息。', href: '/admin/globals/customer-service', ownerOnly: true, title: '客服 API 配置' },
]

export default function BeforeDashboard() {
  const locale = useLocale()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/dashboard', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setData)
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <div className="before-dashboard">
      <header className="before-dashboard__intro">
        <div>
          <p className="before-dashboard__eyebrow">内容工作台</p>
          <h2>管理网站内容</h2>
          <p>从常用操作开始，状态和质量提示会显示在下方。</p>
        </div>
      </header>

      <section aria-labelledby="before-dashboard-actions" className="before-dashboard__section">
        <div className="before-dashboard__section-heading">
          <div>
            <h3 id="before-dashboard-actions">常用操作</h3>
            <p>快速进入最常用的内容设置。</p>
          </div>
        </div>
        <nav aria-label="后台主要功能" className="before-dashboard__entries">
          {entries.filter((entry) => !entry.ownerOnly || data?.role === 'owner').map((entry) => (
            <Link href={entry.href} key={entry.href}>
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </Link>
          ))}
        </nav>
      </section>

      {data && (
        <>
          <section aria-labelledby="before-dashboard-overview" className="before-dashboard__section">
            <div className="before-dashboard__section-heading">
              <div>
                <h3 id="before-dashboard-overview">内容概览</h3>
                <p>当前网站内容的发布状态。</p>
              </div>
            </div>
            <div className="before-dashboard__stats">
              <div className="before-dashboard__stat">
                <span>商品草稿</span>
                <strong>{data.stats.draftProducts}</strong>
              </div>
              <div className="before-dashboard__stat">
                <span>已发布商品</span>
                <strong>{data.stats.publishedProducts}</strong>
              </div>
              <div className="before-dashboard__stat">
                <span>已下架商品</span>
                <strong>{data.stats.unlistedProducts}</strong>
              </div>
              <div className="before-dashboard__stat">
                <span>已发布文章</span>
                <strong>{data.stats.publishedPosts}</strong>
              </div>
              <div className={`before-dashboard__stat${data.stats.failedTranslations ? ' is-warning' : ''}`}>
                <span>翻译失败内容</span>
                <strong>{data.stats.failedTranslations}</strong>
              </div>
            </div>
          </section>

          {(data.quality.missingImages > 0 || data.quality.contactMissing) && (
            <Banner className="before-dashboard__quality" type="info">
              内容质量提示：
              {data.quality.missingImages > 0 && ` ${data.quality.missingImages} 个商品缺少图片。`}
              {data.quality.contactMissing && ' 公司业务邮箱尚未填写。'}
            </Banner>
          )}

          <div className="before-dashboard__columns">
            <section className="before-dashboard__panel">
              <h3>最近发布</h3>
              {data.recent.length ? (
                <ul>{data.recent.map((item) => <li key={`${item.type}-${item.href}`}><Link href={item.href}>{item.type} · {item.title}</Link></li>)}</ul>
              ) : <p>暂无已发布内容。</p>}
            </section>
            {data.role === 'owner' && (
              <section className="before-dashboard__panel">
                <h3>最近审计记录</h3>
                {data.audits?.length ? (
                  <ul>{data.audits.map((item) => <li key={item.id}>{item.summary}</li>)}</ul>
                ) : <p>暂无审计记录。</p>}
              </section>
            )}
          </div>
        </>
      )}

      <p className="before-dashboard__footer">
        <Link href={`/${locale.code}`} rel="noreferrer" target="_blank">查看当前语言前台</Link>
        {data?.role === 'owner' && <> · <Link href="/admin/collections/users">管理账号</Link> · <Link href="/admin/collections/audit-events">查看全部审计记录</Link></>}
      </p>
    </div>
  )
}
