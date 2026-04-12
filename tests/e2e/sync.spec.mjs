// End-to-end test voor sync-feature.
// Vereist lopende dev-stack (podman compose -f containers/compose.override.yaml up -d).
// Gebruik: node e2e/sync.spec.mjs
//
// Test het collaboration sync-mechanisme: toast bij wijzigingen van collega,
// stille merge, conflict-flow. Twee parallele browser-contexts simuleren Sam en Noor.

import { chromium } from 'playwright'

const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'https://mybee.snapper-fort.ts.net:8443'
const POLL_WAIT_MS = 12_000

async function login(context, email, password) {
  const page = await context.newPage()
  await page.goto(FRONTEND_URL)
  await page.waitForLoadState('networkidle')

  // Frontend gebruikt onLoad='check-sso' — je moet zelf op "Inloggen"-button klikken
  await page.getByRole('button', { name: /inloggen/i }).first().click()

  // Nu zit je op Keycloak login
  await page.waitForURL(/\/realms\/assessment-boekhouding\/protocol\/openid-connect\/auth/, { timeout: 15_000 })

  await page.fill('input[name="username"]', email)
  await page.fill('input[name="password"]', password)
  await Promise.all([
    page.waitForURL(u => !u.toString().includes('/realms/'), { timeout: 15_000 }),
    page.click('input[type="submit"], button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  return page
}

async function openDpiaAssessment(page) {
  // Navigeer via /projecten (mocht landing andere state hebben)
  await page.goto(`${FRONTEND_URL}/projecten`)
  await page.waitForLoadState('networkidle')
  await page.getByText(/Cameratoezicht Stationsgebied/).first().click()
  await page.waitForLoadState('networkidle')
  // Wacht tot het project detail laadt, klik dan op de DPIA-assessment link/row
  // De assessment-lijst toont items met de naam (bv. "DPIA: ...")
  const dpiaItem = page.locator('a:has-text("DPIA"), [role="link"]:has-text("DPIA")').first()
  await dpiaItem.waitFor({ state: 'visible', timeout: 10_000 })
  await dpiaItem.click()
  // Wacht tot URL naar /assessment/ navigeert
  await page.waitForURL(/\/assessment\//, { timeout: 10_000 })
  await page.waitForLoadState('networkidle')
}

async function runTests() {
  console.log(`E2E sync test — ${FRONTEND_URL}\n`)

  // Ignore cert errors voor self-signed / dev certs
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors'],
  })

  const passed = []
  const failed = []

  async function test(name, fn) {
    process.stdout.write(`  ${name}... `)
    try {
      await fn()
      passed.push(name)
      console.log('✓')
    } catch (e) {
      failed.push({ name, error: e.message })
      console.log('✗')
      console.log(`    ${e.message.split('\n')[0]}`)
    }
  }

  try {
    await test('Frontend laadt', async () => {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      const response = await page.goto(FRONTEND_URL)
      if (response.status() !== 200) throw new Error(`HTTP ${response.status()}`)
      await ctx.close()
    })

    await test('Login als Sam werkt', async () => {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
      const page = await login(ctx, 'sam@example.com', 'welkom123')
      // Na login zit je in de app
      const url = page.url()
      if (!url.startsWith(FRONTEND_URL)) throw new Error(`Onverwachte URL: ${url}`)
      await ctx.close()
    })

    await test('Assessment kan geopend worden', async () => {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
      const page = await login(ctx, 'noor@example.com', 'welkom123')
      await openDpiaAssessment(page)
      const url = page.url()
      if (!url.includes('/assessment/')) throw new Error(`Geen assessment-URL: ${url}`)
      await ctx.close()
    })

    await test('Samenwerken: Noor wijzigt veld, Sam ziet toast', async () => {
      const samCtx = await browser.newContext({ ignoreHTTPSErrors: true })
      const noorCtx = await browser.newContext({ ignoreHTTPSErrors: true })

      const samPage = await login(samCtx, 'sam@example.com', 'welkom123')
      const noorPage = await login(noorCtx, 'noor@example.com', 'welkom123')

      await openDpiaAssessment(samPage)
      await openDpiaAssessment(noorPage)

      // Bevestig dat beiden écht in de assessment editor zitten
      if (!samPage.url().includes('/assessment/')) {
        throw new Error(`Sam niet in assessment editor: ${samPage.url()}`)
      }
      if (!noorPage.url().includes('/assessment/')) {
        throw new Error(`Noor niet in assessment editor: ${noorPage.url()}`)
      }

      // Noor wijzigt het eerste tekstveld
      const noorTextbox = noorPage.locator('input[type="text"]:visible, textarea:visible').first()
      await noorTextbox.waitFor({ state: 'visible', timeout: 10_000 })
      const testValue = `E2E test ${Date.now()}`
      await noorTextbox.fill(testValue)
      await noorTextbox.blur()

      // Wacht op debounce (500ms) + save
      await noorPage.waitForTimeout(2_000)

      // Wacht op Sam's polling cycle (10s) + toast animatie
      await samPage.waitForTimeout(POLL_WAIT_MS)

      // Oude banner mag NIET tonen
      const oudeBanner = samPage.getByText(/Een collega is bezig geweest en er is een nieuwere versie/)
      if (await oudeBanner.isVisible().catch(() => false)) {
        throw new Error('Oude versie-mismatch banner is nog zichtbaar')
      }

      // De nieuwe toast zou WEL moeten tonen (auto-dismiss of persistent)
      // Óf de wijziging is al zichtbaar in Sam's veld (stille merge)
      const toast = samPage.locator('.sync-toast')
      const samTextboxValue = await samPage.locator('input[type="text"]:visible, textarea:visible').first().inputValue().catch(() => '')

      const toastVisible = await toast.isVisible().catch(() => false)
      const valueSynced = samTextboxValue === testValue

      if (!toastVisible && !valueSynced) {
        throw new Error(`Geen toast en geen synced value — sync werkt niet. Sam value: "${samTextboxValue}", verwacht: "${testValue}"`)
      }

      await samCtx.close()
      await noorCtx.close()
    })

  } finally {
    await browser.close()
  }

  console.log(`\n${passed.length} geslaagd, ${failed.length} gefaald`)
  if (failed.length > 0) {
    console.log('\nGefaalde tests:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.error.split('\n')[0]}`)
    process.exit(1)
  }
}

runTests().catch(e => { console.error(e); process.exit(1) })
