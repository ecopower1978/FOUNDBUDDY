'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type Status =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null

export default function InitializeForm() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || ''
    setToken(value)
    window.history.replaceState({}, document.title, window.location.pathname)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)

    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') || '')
    const confirmPassword = String(values.get('confirmPassword') || '')
    if (password !== confirmPassword) {
      setStatus({ kind: 'error', message: '两次输入的密码不一致。' })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/initialize', {
        body: JSON.stringify({
          confirmPassword,
          email: values.get('email'),
          name: values.get('name'),
          password,
          token,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(result?.error || '账号创建失败，请稍后重试。')
      }
      setStatus({
        kind: 'success',
        message: '管理员账号已创建。请使用刚才填写的邮箱和密码登录后台。',
      })
      event.currentTarget.reset()
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '账号创建失败，请稍后重试。',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const ready = Boolean(token) && !status?.kind?.includes('success')

  return (
    <main style={styles.page}>
      <section aria-labelledby="initialize-title" style={styles.card}>
        <p style={styles.eyebrow}>FOUNDBUDDY · ADMIN SETUP</p>
        <h1 id="initialize-title" style={styles.title}>
          创建管理员账号
        </h1>
        <p style={styles.intro}>
          此页面用于项目首次交付。请创建一个正式管理员账号；创建成功后，这个一次性链接将立即失效。
        </p>

        {status && (
          <div
            aria-live="polite"
            role={status.kind === 'error' ? 'alert' : 'status'}
            style={status.kind === 'error' ? styles.error : styles.success}
          >
            {status.message}
          </div>
        )}

        {status?.kind === 'success' ? (
          <Link href="/admin/login" style={styles.button}>
            前往后台登录
          </Link>
        ) : (
          <form onSubmit={submit}>
            <label style={styles.label}>
              姓名
              <input autoComplete="name" name="name" required style={styles.input} />
            </label>
            <label style={styles.label}>
              登录邮箱
              <input
                autoComplete="email"
                name="email"
                required
                style={styles.input}
                type="email"
              />
            </label>
            <label style={styles.label}>
              登录密码
              <input
                autoComplete="new-password"
                minLength={12}
                name="password"
                required
                style={styles.input}
                type="password"
              />
              <span style={styles.hint}>至少 12 位，建议使用密码管理器生成。</span>
            </label>
            <label style={styles.label}>
              确认密码
              <input
                autoComplete="new-password"
                minLength={12}
                name="confirmPassword"
                required
                style={styles.input}
                type="password"
              />
            </label>
            {!token && (
              <p style={styles.warning}>
                初始化链接无效或尚未加载，请从客户收到的完整链接重新打开此页面。
              </p>
            )}
            <button disabled={!ready || submitting} style={styles.button} type="submit">
              {submitting ? '正在创建…' : '创建管理员账号'}
            </button>
          </form>
        )}

        <p style={styles.note}>
          请勿把此链接发布到群聊、工单或代码仓库。它等同于一次性开户凭证，只应私下发送给项目负责人。
        </p>
      </section>
    </main>
  )
}

const styles = {
  button: {
    alignItems: 'center',
    background: '#176b55',
    border: 0,
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: 15,
    fontWeight: 700,
    justifyContent: 'center',
    minHeight: 48,
    padding: '0 20px',
    textDecoration: 'none',
    width: '100%',
  },
  card: {
    background: '#fff',
    border: '1px solid #dbe6df',
    borderRadius: 18,
    boxShadow: '0 22px 70px rgba(20, 73, 57, 0.12)',
    maxWidth: 540,
    padding: '42px 38px',
    width: '100%',
  },
  error: {
    background: '#fff0ef',
    border: '1px solid #f2c8c4',
    borderRadius: 10,
    color: '#9d3028',
    marginBottom: 20,
    padding: '12px 14px',
  },
  eyebrow: {
    color: '#176b55',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    margin: '0 0 12px',
  },
  hint: {
    color: '#6a8178',
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    background: '#fbfcf8',
    border: '1px solid #cbdad1',
    borderRadius: 9,
    boxSizing: 'border-box' as const,
    color: '#18332d',
    fontSize: 16,
    marginTop: 8,
    minHeight: 46,
    padding: '0 13px',
    width: '100%',
  },
  intro: {
    color: '#5c746b',
    fontSize: 15,
    lineHeight: 1.7,
    margin: '0 0 24px',
  },
  label: {
    color: '#24483d',
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 17,
  },
  note: {
    color: '#779087',
    fontSize: 12,
    lineHeight: 1.65,
    margin: '22px 0 0',
  },
  page: {
    alignItems: 'center',
    background: '#f4f8f3',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '40px 18px',
  },
  success: {
    background: '#edf8f0',
    border: '1px solid #b9dfc2',
    borderRadius: 10,
    color: '#21663b',
    marginBottom: 20,
    padding: '12px 14px',
  },
  title: {
    color: '#143e34',
    fontSize: 'clamp(30px, 5vw, 42px)',
    letterSpacing: '-0.04em',
    lineHeight: 1.1,
    margin: '0 0 17px',
  },
  warning: {
    background: '#fff8e9',
    border: '1px solid #f0dba6',
    borderRadius: 10,
    color: '#805d1b',
    fontSize: 13,
    lineHeight: 1.55,
    margin: '2px 0 17px',
    padding: '11px 13px',
  },
} satisfies Record<string, React.CSSProperties>
