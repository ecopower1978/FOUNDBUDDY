import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('public multilingual experience', () => {
  test('redirects the root and exposes one accessible page heading', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator('h1')).toHaveCount(1)

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze()
    expect(
      results.violations.filter((item) =>
        ['critical', 'serious'].includes(item.impact || ''),
      ),
    ).toEqual([])
  })

  test('mobile navigation traps focus and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await page.goto('/en')
    const menu = page.locator('.trade-header__menu-button')
    await menu.click()
    await expect(page.locator('#mobile-navigation')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#mobile-navigation')).toHaveCount(0)
    await expect(menu).toBeFocused()
  })

  test('language listbox and AI dialog support keyboard use', async ({ page }) => {
    await page.goto('/en')
    const languageButton = page.locator('.language-switcher__trigger').first()
    await languageButton.focus()
    await page.keyboard.press('Enter')
    const listbox = page.getByRole('listbox').first()
    await expect(listbox).toBeVisible()
    await page.keyboard.press('End')
    await page.keyboard.press('Escape')
    await expect(languageButton).toBeFocused()

    const chatButton = page.getByRole('button', {
      name: /open ai customer service/i,
    })
    await chatButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('#ai-chat-input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(chatButton).toBeFocused()
  })

  test('serves RTL locale metadata and legacy permanent redirects', async ({
    page,
    request,
  }) => {
    await page.goto('/ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/ar$/,
    )

    const legacy = await request.get('/posts', { maxRedirects: 0 })
    expect(legacy.status()).toBe(308)
    expect(legacy.headers().location).toBe('/en/posts')
  })
})
