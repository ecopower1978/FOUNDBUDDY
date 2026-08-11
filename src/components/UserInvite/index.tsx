'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

import './index.scss'

export default function UserInvite() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/invite', {
        body: JSON.stringify({
          email: values.get('email'),
          name: values.get('name'),
          role: values.get('role'),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || '邀请发送失败')
      toast.success('邀请已发送。对方需在 24 小时内设置密码。')
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '邀请发送失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="user-invite" aria-label="邀请后台账号">
      <Button
        buttonStyle="secondary"
        onClick={() => setOpen((value) => !value)}
        size="small"
      >
        {open ? '收起邀请表单' : '邀请后台账号'}
      </Button>
      {open && (
        <form onSubmit={invite}>
          <label>
            姓名
            <input autoComplete="name" maxLength={120} name="name" required />
          </label>
          <label>
            邮箱
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            角色
            <select defaultValue="editor" name="role">
              <option value="editor">内容编辑</option>
              <option value="owner">所有者</option>
            </select>
          </label>
          <p>系统不会显示或发送固定密码；受邀者将收到一次性密码设置链接。</p>
          <Button disabled={submitting} size="small" type="submit">
            {submitting ? '正在发送…' : '发送邀请'}
          </Button>
        </form>
      )}
    </section>
  )
}
