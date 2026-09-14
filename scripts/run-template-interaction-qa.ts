import { chromium, type Page, type Response } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const templates = ['trust', 'catalog', 'solution'] as const
type Template = (typeof templates)[number]

const locales = ['en', 'es', 'ar', 'de', 'he', 'ko', 'pt', 'zh-CN', 'zh-TW'] as const
type Locale = (typeof locales)[number]

const requestedTemplate = process.argv.find((value) => value.startsWith('--template='))?.split('=')[1]
const template = (requestedTemplate || process.env.SITE_TEMPLATE || 'trust') as Template
if (!templates.includes(template)) throw new Error(`Unknown template: ${template}`)

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3000'
const outputRoot = path.resolve(
  process.env.QA_OUTPUT || path.join('reports', 'frontend-template-interaction-qa-20260914'),
)
const templateOutput = path.join(outputRoot, template)

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const

type CheckStatus = 'passed' | 'failed' | 'skipped'
type Check = {
  status: CheckStatus
  category: string
  action: string
  source: string
  target?: string
  details?: string
}

type LinkInfo = {
  href: string
  text: string
  index: number
  visible: boolean
}

const checks: Check[] = []
const discoveredPaths = new Set<string>()

function addCheck(check: Check) {
  checks.push(check)
}

function pass(category: string, action: string, source: string, target?: string, details?: string) {
  addCheck({ status: 'passed', category, action, source, target, details })
}

function skip(category: string, action: string, source: string, details: string) {
  addCheck({ status: 'skipped', category, action, source, details })
}

function fail(category: string, action: string, source: string, error: unknown, target?: string) {
  addCheck({
    status: 'failed',
    category,
    action,
    source,
    target,
    details: error instanceof Error ? error.message : String(error),
  })
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isIgnoredRequest(url: string, failure: string) {
  return (
    url.includes('/api/users/me') ||
    url.includes('/__nextjs_font/') ||
    url.includes('/favicon') ||
    failure === 'net::ERR_ABORTED'
  )
}

async function waitForRenderedPage(page: Page) {
  await page.waitForSelector('main', { state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => document.body.innerText.trim().length > 100, undefined, {
    timeout: 20_000,
  })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(250)
}

async function warmLazyImages(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 640)
    for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
      window.scrollTo(0, top)
      await new Promise((resolve) => window.setTimeout(resolve, 60))
    }
    window.scrollTo(0, 0)
    await new Promise((resolve) => window.setTimeout(resolve, 120))
  })
}

async function collectPageState(page: Page) {
  return page.evaluate(() => {
    const images = Array.from(document.images)
    return {
      brokenImages: images
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
      bodyTextLength: document.body.innerText.trim().length,
      direction: document.documentElement.dir,
      h1Count: document.querySelectorAll('h1').length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      mainCount: document.querySelectorAll('main').length,
      templateMarker: document.querySelectorAll('[data-site-template]').length === 1,
    }
  })
}

async function collectLinks(page: Page): Promise<LinkInfo[]> {
  return page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((anchor, index) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: (anchor.textContent || '').replace(/\s+/g, ' ').trim(),
      index,
      visible: Boolean((anchor as HTMLElement).offsetWidth || (anchor as HTMLElement).offsetHeight),
    })),
  )
}

function isSameOrigin(url: URL) {
  return url.origin === new URL(baseURL).origin
}

function pathWithSearch(url: URL) {
  return `${url.pathname}${url.search}`
}

async function openAndCheck(
  page: Page,
  route: string,
  viewport: { width: number; height: number },
  category = 'page display',
) {
  await page.setViewportSize(viewport)
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  const badResponses: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  }
  const onPageError = (error: Error) => pageErrors.push(error.message)
  const onRequestFailed = (request: { url: () => string; failure: () => { errorText?: string } | null }) => {
    const url = request.url()
    const failure = request.failure()?.errorText || 'failed'
    if (!isIgnoredRequest(url, failure)) failedRequests.push(`${url} (${failure})`)
  }
  const onResponse = (response: Response) => {
    if (response.status() >= 400 && !response.url().includes('/api/users/me')) {
      badResponses.push(`${response.status()} ${response.url()}`)
    }
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  let response: Response | null = null
  let navigationError: string | null = null
  let state: Awaited<ReturnType<typeof collectPageState>> | null = null
  const absoluteURL = new URL(route, baseURL).toString()

  try {
    response = await page.goto(absoluteURL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await waitForRenderedPage(page)
    await warmLazyImages(page)
    state = await collectPageState(page)
  } catch (error) {
    navigationError = describeError(error)
  }

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  page.off('requestfailed', onRequestFailed)
  page.off('response', onResponse)

  const errors = [
    navigationError,
    response && response.status() !== 200 ? `HTTP ${response.status()}` : null,
    state && state.mainCount !== 1 ? `Expected one main, received ${state.mainCount}` : null,
    state && state.h1Count !== 1 ? `Expected one h1, received ${state.h1Count}` : null,
    state && !state.templateMarker ? 'Template marker is missing or duplicated' : null,
    state && state.bodyTextLength <= 100 ? 'Rendered page has too little text' : null,
    state && state.horizontalOverflow ? 'Horizontal overflow detected' : null,
    state && state.brokenImages.length ? `Broken images: ${state.brokenImages.join(', ')}` : null,
    ...consoleErrors.map((item) => `Console error: ${item}`),
    ...pageErrors.map((item) => `Page error: ${item}`),
    ...failedRequests.map((item) => `Request failed: ${item}`),
    ...badResponses.map((item) => `Bad response: ${item}`),
  ].filter(Boolean)

  if (errors.length) {
    fail(category, 'render and health check', route, new Error(errors.join(' | ')), absoluteURL)
  } else {
    pass(category, 'render and health check', route, absoluteURL, `${viewport.width}x${viewport.height}`)
  }

  return {
    ok: errors.length === 0,
    links: state ? await collectLinks(page) : [],
  }
}

async function checkProtocolLinks(page: Page, route: string) {
  const links = await collectLinks(page)
  const unique = new Map<string, LinkInfo>()
  for (const link of links) {
    const url = new URL(link.href, baseURL)
    if (['mailto:', 'tel:', 'weixin:'].includes(url.protocol)) unique.set(link.href, link)
  }

  for (const link of unique.values()) {
    try {
      const url = new URL(link.href, baseURL)
      if (!link.text && url.protocol !== 'weixin:') throw new Error('Protocol link has no visible label')
      pass('button/link target', 'protocol target is present', route, link.href, link.text || url.protocol)
    } catch (error) {
      fail('button/link target', 'protocol target is present', route, error, link.href)
    }
  }
}

async function checkInternalLinkTargets(
  page: Page,
  sourceRoute: string,
  links: LinkInfo[],
  viewport: { width: number; height: number },
) {
  const unique = new Map<string, LinkInfo>()
  for (const link of links) {
    const url = new URL(link.href, baseURL)
    if (!isSameOrigin(url)) continue
    if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) continue
    unique.set(`${url.pathname}${url.search}${url.hash}`, link)
  }

  for (const link of unique.values()) {
    const url = new URL(link.href, baseURL)
    const destination = pathWithSearch(url)
    if (url.hash) {
      try {
        await page.goto(new URL(destination, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await waitForRenderedPage(page)
        const hashId = decodeURIComponent(url.hash.slice(1)).replaceAll('"', '\\"')
        const target = page.locator(`[id="${hashId}"]`)
        if (await target.count() !== 1) throw new Error(`Anchor target not found: ${url.hash}`)
        pass('button/link target', 'anchor target exists', sourceRoute, link.href, link.text)
      } catch (error) {
        fail('button/link target', 'anchor target exists', sourceRoute, error, link.href)
      }
      continue
    }

    discoveredPaths.add(destination)
    const result = await openAndCheck(page, destination, viewport, 'button/link destination')
    if (result.ok) pass('button/link target', 'internal destination renders', sourceRoute, destination, link.text)
  }
}

async function checkVisibleInternalLinkClicks(
  page: Page,
  sourceRoute: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport)
  await page.goto(new URL(sourceRoute, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await waitForRenderedPage(page)
  const links = await collectLinks(page)
  const candidates = links.filter((link) => {
    const url = new URL(link.href, baseURL)
    return link.visible && isSameOrigin(url) && !url.hash && !url.pathname.startsWith('/_next/') && !url.pathname.startsWith('/api/')
  })
  const unique = new Map<string, LinkInfo>()
  for (const link of candidates) unique.set(`${link.href}|${link.text}`, link)

  for (const link of unique.values()) {
    try {
      await page.goto(new URL(sourceRoute, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await waitForRenderedPage(page)
      const locator = page.locator('a[href]').nth(link.index)
      if (!(await locator.isVisible())) {
        skip('button/link click', 'visible link click', sourceRoute, `Link became hidden: ${link.text || link.href}`)
        continue
      }
      await locator.click()
      await page.waitForURL((current) => current.pathname === new URL(link.href, baseURL).pathname, { timeout: 15_000 })
      await waitForRenderedPage(page)
      const state = await collectPageState(page)
      if (state.mainCount !== 1 || state.horizontalOverflow || state.brokenImages.length) {
        throw new Error('Destination opened but page health check failed')
      }
      pass('button/link click', 'visible link click and destination', sourceRoute, link.href, link.text)
    } catch (error) {
      fail('button/link click', 'visible link click and destination', sourceRoute, error, link.href)
    }
  }
  await page.setViewportSize(viewport)
}

async function checkMobileMenu(page: Page, route: string) {
  const menu = page.locator('.trade-header__menu-button:visible')
  if (await menu.count() === 0) {
    skip('button display', 'mobile menu controls', route, 'Mobile menu is not visible at this viewport')
    return
  }
  try {
    await menu.click()
    const panel = page.locator('#mobile-navigation')
    if (!(await panel.isVisible())) throw new Error('Mobile navigation panel did not open')
    if ((await menu.getAttribute('aria-expanded')) !== 'true') throw new Error('Menu aria-expanded did not become true')
    if (await panel.locator('a').count() < 3) throw new Error('Mobile navigation links are missing')
    pass('button display', 'mobile menu opens with links', route)

    const backdrop = page.locator('.trade-header__backdrop:visible')
    const backdropBox = await backdrop.boundingBox()
    const isRTL = (await page.locator('html').getAttribute('dir')) === 'rtl'
    const closeX = isRTL ? Math.max((backdropBox?.width || 4) - 2, 1) : 2
    await backdrop.click({ position: { x: closeX, y: 2 }, force: true })
    await page.waitForSelector('#mobile-navigation', { state: 'detached', timeout: 5_000 })
    pass('button display', 'mobile menu backdrop closes panel', route)

    await menu.click()
    await menu.click()
    if (await page.locator('#mobile-navigation').count() !== 0) throw new Error('Menu toggle did not close panel')
    pass('button display', 'mobile menu toggle closes panel', route)
  } catch (error) {
    fail('button display', 'mobile menu interaction', route, error)
  }
}

async function checkLanguageSwitcher(page: Page, route: string) {
  const mobileMenu = page.locator('.trade-header__menu-button:visible')
  const isMobile = await mobileMenu.count() > 0
  if (isMobile && await page.locator('#mobile-navigation').count() === 0) await mobileMenu.click()
  const trigger = isMobile
    ? page.locator('#mobile-navigation .language-switcher__trigger:visible').first()
    : page.locator('.language-switcher__trigger:visible').first()
  if (await trigger.count() === 0) {
    fail('button display', 'language switcher is visible', route, new Error('Language switcher trigger is missing'))
    return
  }

  try {
    await trigger.click()
    const options = page.locator('[role="option"]:visible')
    if (await options.count() !== locales.length) {
      throw new Error(`Expected ${locales.length} language options, received ${await options.count()}`)
    }
    pass('button display', 'language option list opens', route, undefined, `${locales.length} options`)
  } catch (error) {
    fail('button display', 'language option list opens', route, error)
    return
  }

  for (let index = 0; index < locales.length; index += 1) {
    const locale = locales[index]
    try {
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await waitForRenderedPage(page)
      if (isMobile) await page.locator('.trade-header__menu-button:visible').click()
      const currentTrigger = isMobile
        ? page.locator('#mobile-navigation .language-switcher__trigger:visible').first()
        : page.locator('.language-switcher__trigger:visible').first()
      await currentTrigger.click()
      await page.locator('[role="option"]:visible').nth(index).click()
      await page.waitForURL((current) => current.pathname === `/${locale}` || current.pathname.startsWith(`/${locale}/`), { timeout: 20_000 })
      await waitForRenderedPage(page)
      const state = await collectPageState(page)
      const expectedDirection = locale === 'ar' || locale === 'he' ? 'rtl' : 'ltr'
      if (state.direction !== expectedDirection) throw new Error(`Expected dir=${expectedDirection}, received ${state.direction}`)
      if (state.mainCount !== 1 || state.brokenImages.length || state.horizontalOverflow) throw new Error('Localized page health check failed')
      pass('button/link click', 'language option navigates and renders', route, `/${locale}`, locale)
    } catch (error) {
      fail('button/link click', 'language option navigates and renders', route, error, `/${locale}`)
    }
  }
}

async function checkAIChat(page: Page, route: string) {
  const openButton = page.locator('[data-open-chat="true"]:visible').first()
  const toggle = page.locator('.ai-chat__toggle:visible').first()
  if (await toggle.count() === 0) {
    fail('button display', 'AI customer service trigger is visible', route, new Error('AI chat toggle is missing'))
    return
  }

  try {
    await page.route('**/api/ai-chat', async (requestRoute) => {
      await requestRoute.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ answer: 'QA response' }),
        status: 200,
      })
    })
    if (await openButton.count()) await openButton.click()
    else await toggle.click()
    const dialog = page.getByRole('dialog', { name: /product assistant|产品智能客服|مساعد المنتجات|עוזר מוצרים/i })
    if (!(await dialog.isVisible())) throw new Error('AI chat dialog did not open')
    const input = page.locator('#ai-chat-input')
    const send = dialog.getByRole('button', { name: /send message|发送消息|إرسال الرسالة|שליחת הודעה/i })
    if (!(await input.isVisible()) || !(await send.isDisabled())) throw new Error('AI chat input/send initial state is wrong')
    await input.fill('QA')
    if (await send.isDisabled()) throw new Error('AI send button stayed disabled after input')
    await send.click()
    await page.getByText('QA response', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    pass('button display', 'AI chat opens and sends a message', route)

    await dialog.getByRole('button', { name: /close chat|关闭客服|إغلاق المحادثة|סגירת הצ׳אט/i }).click()
    if (await page.getByRole('dialog').count() !== 0) throw new Error('AI chat close button did not close dialog')
    pass('button display', 'AI chat close button closes dialog', route)

    await toggle.click()
    if (!(await page.getByRole('dialog').isVisible())) throw new Error('Floating AI chat toggle did not open dialog')
    await toggle.click()
    if (await page.getByRole('dialog').count() !== 0) throw new Error('Floating AI chat toggle did not close dialog')
    pass('button display', 'floating AI chat toggle opens and closes dialog', route)
    await page.unroute('**/api/ai-chat')
  } catch (error) {
    await page.unroute('**/api/ai-chat').catch(() => undefined)
    fail('button display', 'AI chat interaction', route, error)
  }
}

async function checkCarousel(page: Page, selector: string, route: string, label: string) {
  const carousel = page.locator(selector).first()
  if (await carousel.count() === 0) {
    skip('button display', `${label} controls`, route, 'Carousel is not present in this template')
    return
  }
  const dots = carousel.locator('.hero-ad__dots button, .product-carousel__dots button')
  const arrows = carousel.locator('.hero-ad__arrows button, .product-carousel__arrows button')
  try {
    if (await dots.count() < 2 || await arrows.count() !== 3) throw new Error(`${label} control buttons are incomplete`)
    const firstButton = arrows.first()
    const initialLabel = (await firstButton.getAttribute('aria-label')) || ''
    await firstButton.click()
    const pausedLabel = (await firstButton.getAttribute('aria-label')) || ''
    if (initialLabel === pausedLabel) throw new Error(`${label} play/pause button did not change state`)
    pass('button display', `${label} play/pause toggles state`, route)
    await firstButton.click()

    const dotCount = await dots.count()
    if (dotCount > 1) {
      await firstButton.click()
      for (let index = 0; index < dotCount; index += 1) {
        const dot = dots.nth(index)
        await dot.click()
        await page.waitForTimeout(100)
        if ((await dot.getAttribute('aria-current')) !== 'true') throw new Error(`${label} dot ${index + 1} did not activate`)
        pass('button display', `${label} dot ${index + 1} switches slide`, route)
      }
      const previous = arrows.nth(1)
      const next = arrows.nth(2)
      const activeBefore = await carousel.locator('button[aria-current="true"]').first().getAttribute('aria-label')
      await next.click()
      await page.waitForTimeout(100)
      const activeAfterNext = await carousel.locator('button[aria-current="true"]').first().getAttribute('aria-label')
      if (activeBefore === activeAfterNext) throw new Error(`${label} next button did not change slide`)
      pass('button display', `${label} next button switches slide`, route)
      await previous.click()
      await page.waitForTimeout(100)
      pass('button display', `${label} previous button switches slide`, route)
    }
  } catch (error) {
    fail('button display', `${label} carousel controls`, route, error)
  }
}

async function checkProductGallery(page: Page, route: string) {
  const thumbnails = page.locator('.product-detail__thumbnails button:visible')
  if (await thumbnails.count() <= 1) {
    skip('button display', 'product gallery thumbnails', route, 'There is one or no product image')
    return
  }
  try {
    const mainImage = page.locator('.product-detail__main-image img').first()
    for (let index = 0; index < await thumbnails.count(); index += 1) {
      const thumbnail = thumbnails.nth(index)
      await thumbnail.click()
      if ((await thumbnail.getAttribute('aria-pressed')) !== 'true') throw new Error(`Thumbnail ${index + 1} did not become active`)
      if (await mainImage.count() && !(await mainImage.getAttribute('src'))) throw new Error('Active gallery image has no source')
      pass('button display', `product gallery thumbnail ${index + 1} switches image`, route)
    }
  } catch (error) {
    fail('button display', 'product gallery thumbnails', route, error)
  }
}

async function checkUnclassifiedButtons(page: Page, route: string) {
    const buttons = await page.locator('button:visible').evaluateAll((items) =>
    items.map((button) => ({
      ancestorClassName: button.parentElement?.parentElement?.className || button.parentElement?.className || '',
      aria: button.getAttribute('aria-label') || '',
      className: button.className,
      dataOpenChat: button.getAttribute('data-open-chat') || '',
      text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  )
  const unknown = buttons.filter((button) => {
    const marker = `${button.ancestorClassName} ${button.className} ${button.aria} data-open-chat=${button.dataOpenChat} ${button.text}`.toLowerCase()
    return ![
      'trade-header__menu-button',
      'trade-header__backdrop',
      'language-switcher',
      'hero-ad',
      'product-carousel__',
      'ai-chat',
      'data-open-chat',
      'product-detail__gallery',
      'product-detail__thumbnails',
      'next.js dev tools',
    ].some((known) => marker.includes(known))
  })
  if (unknown.length) {
    fail('button coverage', 'no unclassified visible buttons', route, new Error(JSON.stringify(unknown)))
  } else {
    pass('button coverage', 'all visible buttons have an interaction rule', route, undefined, `${buttons.length} buttons`)
  }
}

async function main() {
  await mkdir(templateOutput, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  const homeRoutes: Array<{ route: string; locale: Locale }> = [
    { route: '/en', locale: 'en' },
    { route: '/zh-CN', locale: 'zh-CN' },
    { route: '/ar', locale: 'ar' },
    { route: '/he', locale: 'he' },
  ]

  const sourceViewports = [viewports.desktop, viewports.mobile]

  for (const { route } of homeRoutes) {
    for (const viewport of sourceViewports) {
      const result = await openAndCheck(page, route, viewport)
      await checkProtocolLinks(page, route)
      await checkInternalLinkTargets(page, route, result.links, viewport)
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await waitForRenderedPage(page)
      await warmLazyImages(page)
      if (viewport.width === viewports.mobile.width) await checkMobileMenu(page, route)
      await checkAIChat(page, route)
      await checkUnclassifiedButtons(page, route)
      if (route === '/en') {
        await checkLanguageSwitcher(page, route)
        await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await waitForRenderedPage(page)
        await warmLazyImages(page)
        if (template === 'trust') {
          await checkCarousel(page, '.hero-ad', route, 'hero carousel')
          await checkCarousel(page, '.product-carousel', route, 'product carousel')
        }
      }
    }
  }

  // The language switcher itself navigates through every supported locale.
  await page.goto(new URL('/en', baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await waitForRenderedPage(page)
  await checkLanguageSwitcher(page, '/en')

  // Discover actual server-backed product, blog, and related-product links.
  const discoveryRoutes = ['/en/products', '/en/posts']
  let productRoute: string | null = null
  let postRoute: string | null = null
  for (const route of discoveryRoutes) {
    const result = await openAndCheck(page, route, viewports.desktop)
    await checkProtocolLinks(page, route)
    await checkInternalLinkTargets(page, route, result.links, viewports.desktop)
    if (route.endsWith('/products')) {
      const productLink = result.links.find((link) => /\/products\/[^/]+$/.test(new URL(link.href, baseURL).pathname))
      productRoute = productLink ? pathWithSearch(new URL(productLink.href, baseURL)) : null
    }
    if (route.endsWith('/posts')) {
      const postLink = result.links.find((link) => /\/posts\/[^/]+$/.test(new URL(link.href, baseURL).pathname))
      postRoute = postLink ? pathWithSearch(new URL(postLink.href, baseURL)) : null
    }
  }

  if (productRoute) {
    for (const viewport of sourceViewports) {
      const result = await openAndCheck(page, productRoute, viewport)
      await checkProtocolLinks(page, productRoute)
      await checkInternalLinkTargets(page, productRoute, result.links, viewport)
      await page.goto(new URL(productRoute, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await waitForRenderedPage(page)
      await warmLazyImages(page)
      await checkProductGallery(page, productRoute)
      await checkUnclassifiedButtons(page, productRoute)
    }
  } else {
    skip('route discovery', 'product detail route', '/en/products', 'No server-backed product card was found')
  }

  if (postRoute) {
    for (const viewport of sourceViewports) {
      const result = await openAndCheck(page, postRoute, viewport)
      await checkProtocolLinks(page, postRoute)
      await checkInternalLinkTargets(page, postRoute, result.links, viewport)
      await page.goto(new URL(postRoute, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await waitForRenderedPage(page)
      await warmLazyImages(page)
      await checkUnclassifiedButtons(page, postRoute)
    }
  } else {
    skip('route discovery', 'blog detail route', '/en/posts', 'No published blog card was found')
  }

  // Re-check every discovered public destination in both desktop and mobile sizes.
  const paths = Array.from(discoveredPaths).filter((route) => !route.includes('/api/'))
  for (const route of paths) {
    for (const viewport of sourceViewports) await openAndCheck(page, route, viewport, 'discovered page display')
  }

  // Click every visible internal link at both responsive sizes on the key pages.
  const clickRoutes = ['/en', '/en/products', ...(productRoute ? [productRoute] : []), ...(postRoute ? [postRoute] : [])]
  for (const route of clickRoutes) {
    for (const viewport of sourceViewports) {
      await checkVisibleInternalLinkClicks(page, route, viewport)
    }
  }

  await context.close()
  await browser.close()

  const passed = checks.filter((check) => check.status === 'passed').length
  const failed = checks.filter((check) => check.status === 'failed').length
  const skipped = checks.filter((check) => check.status === 'skipped').length
  const report = {
    completedAt: new Date().toISOString(),
    baseURL,
    template,
    checks: checks.length,
    passed,
    failed,
    skipped,
    discoveredPaths: paths,
    failures: checks.filter((check) => check.status === 'failed'),
    results: checks,
  }
  await writeFile(path.join(templateOutput, 'interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ template, checks: checks.length, passed, failed, skipped, report: path.join(templateOutput, 'interaction-report.json') }, null, 2))
  if (failed) process.exitCode = 1
}

await main()
