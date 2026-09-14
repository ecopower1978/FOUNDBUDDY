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
const locales = ['en', 'zh-CN', 'ar', 'he']
const productSlugs = [
  'product-mtlb75z7',
  'product-mtl8g5am',
  'product-mtl7qp8h',
  'product-mtjk8656',
  'product-mtfw0fz5',
  'product-mtfv4o42',
]
const viewportMatrix = [
  { height: 812, width: 375 },
  { height: 1024, width: 768 },
  { height: 900, width: 1024 },
  { height: 900, width: 1440 },
]

const routes = locales.flatMap((locale) => [
  { key: `${locale}-home`, path: `/${locale}` },
  { key: `${locale}-products`, path: `/${locale}/products` },
  ...productSlugs.map((slug) => ({
    key: `${locale}-${slug}`,
    path: `/${locale}/products/${slug}`,
  })),
  { key: `${locale}-posts`, path: `/${locale}/posts` },
])

const templateOutput = path.join(outputRoot, template)
await mkdir(templateOutput, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const results: Array<Record<string, unknown>> = []

for (const route of routes) {
  for (const viewport of viewportMatrix) {
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
    try {
      const response = await page.goto(absoluteURL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      status = response?.status() || null
      await page.waitForSelector('main', { state: 'visible', timeout: 15_000 })
      await page.waitForFunction(() => document.body.innerText.trim().length > 100, undefined, {
        timeout: 15_000,
      })
      await page.evaluate(() => document.fonts?.ready)
      await page.waitForTimeout(250)
      // Full-page screenshots do not necessarily enter every lazy image into
      // the viewport. Walk the document once so the visual evidence includes
      // every server-backed product image, then restore the top position.
      await page.evaluate(async () => {
        const step = Math.max(window.innerHeight, 480)
        for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
          window.scrollTo(0, top)
          await new Promise((resolve) => window.setTimeout(resolve, 80))
        }
        window.scrollTo(0, 0)
        await new Promise((resolve) => window.setTimeout(resolve, 180))
      })
      await page.screenshot({ path: screenshotPath, fullPage: true })
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error)
    }

    const pageState = await page
      .evaluate(() => {
        const images = Array.from(document.images)
        return {
          brokenImages: images
            .filter((image) => image.complete && image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src),
          documentDirection: document.documentElement.dir,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          mainCount: document.querySelectorAll('main').length,
          templateCount: document.querySelectorAll('[data-site-template]').length,
        }
      })
      .catch(() => ({
        brokenImages: [],
        documentDirection: '',
        horizontalOverflow: true,
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
      consoleErrors,
      documentDirection: pageState.documentDirection,
      failedRequests,
      horizontalOverflow: pageState.horizontalOverflow,
      navigationError,
      pageErrors,
      route: route.path,
      screenshot: path.relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      status,
      templateMarker: pageState.templateCount === 1,
      mainCount: pageState.mainCount,
      viewport,
    })
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
  viewportCount: viewportMatrix.length,
  screenshotCount: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}
await writeFile(path.join(templateOutput, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ template, screenshots: results.length, passed: report.passed, failed: report.failed, report: path.join(templateOutput, 'report.json') }, null, 2))
if (failures.length) process.exitCode = 1
