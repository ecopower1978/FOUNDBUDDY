import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const templates = ['trust', 'catalog', 'solution'] as const
type Template = (typeof templates)[number]

const requestedTemplate = process.argv.find((value) => value.startsWith('--template='))?.split('=')[1]
const template = (requestedTemplate || process.env.SITE_TEMPLATE || 'trust') as Template
if (!templates.includes(template)) throw new Error(`Unknown template: ${template}`)

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3000'
const outputRoot = path.resolve(
  process.env.QA_OUTPUT || path.join('reports', 'frontend-template-visual-qa-20260914'),
)
const supportedLocales = ['en', 'zh-CN', 'ar', 'he'] as const
const requestedLocales = (process.env.QA_LOCALES || '')
  .split(/[\s,]+/)
  .map((locale) => locale.trim())
  .filter(Boolean)
const invalidLocales = requestedLocales.filter(
  (locale) => !supportedLocales.includes(locale as (typeof supportedLocales)[number]),
)
if (invalidLocales.length) throw new Error(`Unknown QA_LOCALES: ${invalidLocales.join(', ')}`)
const locales = (requestedLocales.length ? requestedLocales : [...supportedLocales]) as Array<
  (typeof supportedLocales)[number]
>
const productSlugs = [
  'product-mtlb75z7',
  'product-mtl8g5am',
  'product-mtl7qp8h',
  'product-mtjk8656',
  'product-mtfw0fz5',
  'product-mtfv4o42',
]
const viewportMatrix = [
  { key: 'mobile', height: 812, width: 375 },
  { key: 'tablet', height: 1024, width: 768 },
  { key: 'desktop-compact', height: 900, width: 1024 },
  { key: 'desktop', height: 900, width: 1440 },
]

const requestedViewports = (process.env.QA_VIEWPORTS || '')
  .split(/[\s,]+/)
  .map((viewport) => viewport.trim())
  .filter(Boolean)
const invalidViewports = requestedViewports.filter(
  (viewport) => !viewportMatrix.some((item) => item.key === viewport),
)
if (invalidViewports.length) throw new Error(`Unknown QA_VIEWPORTS: ${invalidViewports.join(', ')}`)
const activeViewports = requestedViewports.length
  ? viewportMatrix.filter((viewport) => requestedViewports.includes(viewport.key))
  : viewportMatrix

const parseNonNegativeInteger = (value: string | undefined, fallback: number) => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Expected a non-negative integer, received: ${value}`)
  return parsed
}

const caseDelayMs = parseNonNegativeInteger(process.env.QA_DELAY_MS, 0)
const settleDelayMs = parseNonNegativeInteger(process.env.QA_SETTLE_MS, 250)
const scrollStepDelayMs = parseNonNegativeInteger(process.env.QA_SCROLL_STEP_MS, 80)
const scrollSettleDelayMs = parseNonNegativeInteger(process.env.QA_SCROLL_SETTLE_MS, 180)
const minScreenshotBytes = parseNonNegativeInteger(process.env.QA_MIN_SCREENSHOT_BYTES, 50_000)
const maxRoutes = process.env.QA_MAX_ROUTES
  ? parseNonNegativeInteger(process.env.QA_MAX_ROUTES, 0)
  : null

const allRoutes = locales.flatMap((locale) => [
  { key: `${locale}-home`, path: `/${locale}` },
  { key: `${locale}-products`, path: `/${locale}/products` },
  ...productSlugs.map((slug) => ({
    key: `${locale}-${slug}`,
    path: `/${locale}/products/${slug}`,
  })),
  { key: `${locale}-posts`, path: `/${locale}/posts` },
])
const requestedRoute = process.env.QA_ROUTE
const filteredRoutes = requestedRoute ? allRoutes.filter((route) => route.path === requestedRoute) : allRoutes
const routes = maxRoutes === null ? filteredRoutes : filteredRoutes.slice(0, maxRoutes)
if (!routes.length) throw new Error(`Unknown QA_ROUTE: ${requestedRoute}`)

const templateOutput = path.join(outputRoot, template)
await mkdir(templateOutput, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const results: Array<Record<string, unknown>> = []

for (const route of routes) {
  for (const viewport of activeViewports) {
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
      // Payload's auth probe is expected to be unauthenticated on the public
      // site. Next may also abort its dev font request during route changes;
      // neither is a visual regression in this public-page matrix.
      if (
        url.includes('/api/users/me') ||
        url.includes('/__nextjs_font/') ||
        failure === 'net::ERR_ABORTED'
      ) return
      failedRequests.push(`${url} (${failure})`)
    }
    const onResponse = (response: { status: () => number; url: () => string }) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`)
    }
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('requestfailed', onRequestFailed)
    page.on('response', onResponse)

    const absoluteURL = `${baseURL}${route.path}`
    const screenshotPath = path.join(
      templateOutput,
      `${route.key}-${viewport.width}x${viewport.height}.png`,
    )
    let status: number | null = null
    let navigationError: string | null = null
    let screenshotBytes: number | null = null
    try {
      const response = await page.goto(absoluteURL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      status = response?.status() || null
      await page.waitForSelector('main', { state: 'visible', timeout: 15_000 })
      await page.waitForFunction(() => document.body.innerText.trim().length > 100, undefined, {
        timeout: 15_000,
      })
      await page.evaluate(() => document.fonts?.ready)
      await page.waitForFunction(
        () => {
          const carousels = document.querySelectorAll('.hero-ad, .product-carousel')
          for (const carousel of carousels) {
            if (!carousel.classList.contains('hero-ad--ready') && !carousel.classList.contains('product-carousel--ready')) {
              return false
            }
          }
          return true
        },
        undefined,
        { timeout: 5_000 },
      )
      await page.waitForTimeout(settleDelayMs)
      // Full-page screenshots do not necessarily enter every lazy image into
      // the viewport. Walk the document once so the visual evidence includes
      // every server-backed product image, then restore the top position.
      await page.evaluate(async ({ stepDelayMs, settleDelayMs: lazySettleDelayMs }) => {
        const step = Math.max(window.innerHeight, 480)
        for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
          window.scrollTo(0, top)
          await new Promise((resolve) => window.setTimeout(resolve, stepDelayMs))
        }
        window.scrollTo(0, 0)
        await new Promise((resolve) => window.setTimeout(resolve, lazySettleDelayMs))
      }, { stepDelayMs: scrollStepDelayMs, settleDelayMs: scrollSettleDelayMs })
      let screenshot = await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshotBytes = screenshot.byteLength
      if (screenshotBytes < minScreenshotBytes) {
        // A dev-server navigation can finish before Chromium has painted the
        // full-page surface. Retry once so a transient white/partial capture
        // cannot be reported as a valid visual baseline.
        await page.waitForTimeout(Math.max(settleDelayMs, 500))
        screenshot = await page.screenshot({ path: screenshotPath, fullPage: true })
        screenshotBytes = screenshot.byteLength
      }
      if (screenshotBytes < minScreenshotBytes) {
        throw new Error(
          `Screenshot output is suspiciously small: ${screenshotBytes} bytes (minimum ${minScreenshotBytes})`,
        )
      }
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error)
    }

    const pageState = await page
      .evaluate(() => {
        const images = Array.from(document.images)
        const interactiveElements = Array.from(
          document.querySelectorAll<HTMLElement>('a[href], button, [role="button"]'),
        ).filter((element) => {
          const styles = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return (
            styles.display !== 'none' &&
            styles.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth
          )
        })
        const controlLayoutIssues: string[] = []
        const buttonLikeSelector =
          'button, [role="button"], .trade-button, .trade-header__contact, .template-contact__locale-link, .solution-text-link, .hero-ad__content > a'

        for (const link of document.querySelectorAll<HTMLElement>('.template-contact__locale-link')) {
          if (!link.closest('.trade-shell')) {
            controlLayoutIssues.push('contact catalogue link is outside the content shell')
          }
        }

        for (const element of interactiveElements) {
          const rect = element.getBoundingClientRect()
          const label = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('href') || 'unnamed control')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 90)
          let isHorizontallyClipped = false
          let ancestor = element.parentElement
          while (ancestor && ancestor !== document.body) {
            const ancestorStyles = window.getComputedStyle(ancestor)
            if (['hidden', 'clip', 'auto', 'scroll'].includes(ancestorStyles.overflowX)) {
              const ancestorRect = ancestor.getBoundingClientRect()
              if (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1) {
                isHorizontallyClipped = true
                break
              }
            }
            ancestor = ancestor.parentElement
          }
          if (!isHorizontallyClipped && (rect.left < -1 || rect.right > window.innerWidth + 1)) {
            controlLayoutIssues.push(`horizontal bounds: ${label} (${Math.round(rect.left)}..${Math.round(rect.right)} / ${window.innerWidth})`)
          }
          if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
            controlLayoutIssues.push(`content clipped: ${label}`)
          }
          const isButtonLike = element.matches(buttonLikeSelector)
          if (isButtonLike && (rect.width < 44 || rect.height < 44)) {
            controlLayoutIssues.push(`touch target below 44px: ${label} (${Math.round(rect.width)}x${Math.round(rect.height)})`)
          }
        }

        const buttonLikeElements = interactiveElements.filter((element) => element.matches(buttonLikeSelector))
        for (let index = 0; index < buttonLikeElements.length; index += 1) {
          const first = buttonLikeElements[index]
          const firstRect = first.getBoundingClientRect()
          for (let nextIndex = index + 1; nextIndex < buttonLikeElements.length; nextIndex += 1) {
            const second = buttonLikeElements[nextIndex]
            if (first.contains(second) || second.contains(first)) continue
            const secondRect = second.getBoundingClientRect()
            const overlapWidth = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left)
            const overlapHeight = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top)
            if (overlapWidth > 2 && overlapHeight > 2) {
              const firstLabel = (first.getAttribute('aria-label') || first.textContent || first.getAttribute('href') || 'unnamed control')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 90)
              const secondLabel = (second.getAttribute('aria-label') || second.textContent || second.getAttribute('href') || 'unnamed control')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 90)
              controlLayoutIssues.push(`interactive overlap: ${firstLabel} / ${secondLabel}`)
            }
          }
        }

        return {
          brokenImages: images
            .filter((image) => image.complete && image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src),
          controlLayoutIssues,
          documentDirection: document.documentElement.dir,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          interactiveControlCount: interactiveElements.length,
          mainCount: document.querySelectorAll('main').length,
          templateCount: document.querySelectorAll('[data-site-template]').length,
        }
      })
      .catch((error) => ({
        brokenImages: [],
        controlLayoutIssues: [
          `Unable to inspect controls: ${error instanceof Error ? error.message : String(error)}`,
        ],
        documentDirection: '',
        horizontalOverflow: true,
        interactiveControlCount: 0,
        mainCount: 0,
        templateCount: 0,
      }))

    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
    page.off('response', onResponse)

    results.push({
      badResponses,
      brokenImages: pageState.brokenImages,
      controlLayoutIssues: pageState.controlLayoutIssues,
      consoleErrors,
      documentDirection: pageState.documentDirection,
      failedRequests,
      horizontalOverflow: pageState.horizontalOverflow,
      interactiveControlCount: pageState.interactiveControlCount,
      navigationError,
      pageErrors,
      route: route.path,
      screenshot: path.relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      screenshotBytes,
      status,
      templateMarker: pageState.templateCount === 1,
      mainCount: pageState.mainCount,
      viewport,
    })

    if (caseDelayMs) await page.waitForTimeout(caseDelayMs)
  }
}

await browser.close()

const hasItems = (result: Record<string, unknown>, key: string) =>
  Array.isArray(result[key]) && result[key].length > 0
const failures = results.filter((result) =>
  Boolean(
    result.navigationError ||
      result.status !== 200 ||
      hasItems(result, 'consoleErrors') ||
      hasItems(result, 'pageErrors') ||
      hasItems(result, 'failedRequests') ||
      hasItems(result, 'brokenImages') ||
      hasItems(result, 'badResponses') ||
      hasItems(result, 'controlLayoutIssues') ||
      result.horizontalOverflow ||
      result.mainCount !== 1 ||
      !result.templateMarker,
  ),
)
const report = {
  completedAt: new Date().toISOString(),
  baseURL,
  template,
  routeCount: routes.length,
  viewportCount: activeViewports.length,
  locales,
  viewports: activeViewports.map((viewport) => viewport.key),
  throttle: {
    caseDelayMs,
    settleDelayMs,
    scrollStepDelayMs,
    scrollSettleDelayMs,
    minScreenshotBytes,
    maxRoutes,
  },
  screenshotCount: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}
await writeFile(path.join(templateOutput, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ template, screenshots: results.length, passed: report.passed, failed: report.failed, report: path.join(templateOutput, 'report.json') }, null, 2))
if (failures.length) process.exitCode = 1
