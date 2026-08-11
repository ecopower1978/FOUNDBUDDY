import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, testUser } from '../helpers/seedUser'

test.describe('merchant admin', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.beforeEach(async ({ page }) => {
    await login({ page, serverURL: 'http://127.0.0.1:3000', user: testUser })
  })

  test('shows the four primary merchant tasks', async ({ page }) => {
    const primaryTasks = page.getByRole('navigation', { name: '后台主要功能' })
    await expect(primaryTasks).toBeVisible()
    for (const label of [
      '商品管理',
      '首页商品排序',
      '博客管理',
      '公司资料与联系方式',
    ]) {
      await expect(primaryTasks.getByRole('link', { name: new RegExp(label) })).toBeVisible()
    }
  })

  test('opens the product draft form', async ({ page }) => {
    await page.goto('/admin/collections/products/create')
    await expect(page.locator('input[name="title"]')).toBeVisible()
    await expect(page.getByText(/保存草稿|Save Draft/i).first()).toBeVisible()
  })

  test('owner can open accounts and audit records', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/collections\/users/)
    await page.goto('/admin/collections/audit-events')
    await expect(page).toHaveURL(/\/admin\/collections\/audit-events/)
    await page.goto('/admin/globals/customer-service')
    await expect(page).toHaveURL(/\/admin\/globals\/customer-service/)
    await expect(page.locator('input[name="apiUrl"]')).toBeVisible()
  })
})
