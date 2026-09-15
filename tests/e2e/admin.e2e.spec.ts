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
    for (const label of ['商品管理', '首页商品排序', '博客管理', '公司资料与联系方式']) {
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

  test('owner can switch each public template from the dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '前台展示风格' })).toBeVisible()
    await expect(page.getByRole('link', { name: '打开完整设置' })).toHaveAttribute(
      'href',
      '/admin/globals/site-settings',
    )

    await page.goto('/admin/globals/site-settings')
    await expect(page.getByRole('combobox').first()).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByRole('status').filter({ hasText: '当前前台：' })).not.toContainText(
      '未读取',
    )

    const initialTemplate = await page
      .locator('input[name="site-template"]:checked')
      .getAttribute('value')
    const templateOrder =
      initialTemplate === 'catalog'
        ? ['solution', 'trust', 'catalog']
        : initialTemplate === 'solution'
          ? ['trust', 'catalog', 'solution']
          : ['catalog', 'solution', 'trust']

    for (const template of templateOrder) {
      const templateInput = page.locator(`input[name="site-template"][value="${template}"]`)
      await page.locator('label').filter({ has: templateInput }).click()
      await expect(templateInput).toBeChecked()
      await expect(page.getByRole('button', { name: '保存并切换' })).toBeEnabled()
      await page.getByRole('button', { name: '保存并切换' }).click()
      await expect(page.getByRole('status').filter({ hasText: '已切换为' })).toBeVisible()

      const publicPage = await page.context().newPage()
      await publicPage.goto('/en')
      await expect(publicPage.locator('[data-site-template]')).toHaveAttribute(
        'data-site-template',
        template,
      )
      await expect
        .poll(() =>
          publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        )
        .toBe(true)
      await publicPage.setViewportSize({ width: 390, height: 844 })
      await publicPage.reload()
      await expect(publicPage.locator('[data-site-template]')).toHaveAttribute(
        'data-site-template',
        template,
      )
      await expect
        .poll(() =>
          publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        )
        .toBe(true)
      await publicPage.close()
    }
  })
})
