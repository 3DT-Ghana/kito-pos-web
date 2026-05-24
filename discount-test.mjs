/**
 * Playwright click-through test: Sales discount approval flow
 *
 * Scenarios:
 *  1. CASHIER logs in → applies discount → sees approval notice → submits → sale lands in approvals queue
 *  2. BRANCH_MANAGER (has apply_discount) → applies same discount → completes immediately (no approval)
 *  3. BRANCH_MANAGER approves the pending sale from the approvals queue
 */

import { chromium } from 'playwright'
import fs from 'fs'

const BASE = 'http://localhost:3000'
const SCREENSHOT_DIR = '/tmp/discount-test-screenshots'
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let shotIndex = 0
async function shot(page, label) {
  const file = `${SCREENSHOT_DIR}/${String(++shotIndex).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: file, fullPage: false })
  console.log(`📸  ${file}`)
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await shot(page, 'login-page')

  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await shot(page, `login-filled-${email.split('@')[0]}`)
  await page.click('button[type="submit"]')
  await page.waitForLoadState('networkidle')
  await shot(page, `after-login-${email.split('@')[0]}`)
}

async function goToNewSale(page) {
  await page.goto(`${BASE}/sales/new`)
  await page.waitForLoadState('networkidle')
  await shot(page, 'new-sale-page')
}

async function addFirstItemToCart(page) {
  // Click the item search box and wait for dropdown
  const searchInput = page.locator('input[placeholder*="Search items"]').first()
  await searchInput.click()
  await page.waitForTimeout(500)

  // Wait for dropdown items to appear
  const dropdownItem = page.locator('.absolute.z-20 button').first()
  const visible = await dropdownItem.isVisible().catch(() => false)
  if (visible) {
    const itemName = await dropdownItem.locator('p.font-semibold').first().textContent()
    console.log(`  → Adding item: ${itemName?.trim()}`)
    await dropdownItem.click()
    await page.waitForTimeout(300)
    await shot(page, 'item-added-to-cart')
    return true
  }
  console.log('  ⚠ No items in dropdown — check tenant has items')
  return false
}

async function applyLineDiscount(page, value) {
  // Switch to amount mode and enter discount on first cart item
  const amountBtn = page.locator('button:has-text("₵")').first()
  const pctBtn = page.locator('button:has-text("%")').first()

  // Check if discount column exists (enableDiscounts must be on)
  const discountInput = page.locator('input[placeholder="0"][min="0"]').first()
  const exists = await discountInput.isVisible().catch(() => false)
  if (!exists) {
    console.log('  ⚠ Discount inputs not visible — enableDiscounts may be off for this tenant')
    return false
  }

  await amountBtn.click().catch(() => {})
  await discountInput.fill(String(value))
  await discountInput.press('Tab')
  await page.waitForTimeout(300)
  await shot(page, 'discount-entered')
  return true
}

async function checkApprovalNotice(page) {
  const notice = page.locator('text=Discount requires manager approval')
  const visible = await notice.isVisible().catch(() => false)
  console.log(`  → Approval notice visible: ${visible}`)
  await shot(page, 'approval-notice-check')
  return visible
}

async function submitSale(page) {
  const btn = page.locator('button[type="submit"]').first()
  const label = await btn.textContent()
  console.log(`  → Submit button text: "${label?.trim()}"`)
  await btn.click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  await shot(page, 'after-submit')
}

async function checkPendingApprovalState(page) {
  const heading = await page.locator('h2').first().textContent().catch(() => '')
  console.log(`  → Page heading after submit: "${heading?.trim()}"`)
  const isPending = heading?.includes('Awaiting Approval') || heading?.includes('Approval')
  await shot(page, 'pending-state-check')
  return isPending
}

async function goToApprovals(page) {
  await page.goto(`${BASE}/approvals`)
  await page.waitForLoadState('networkidle')
  await shot(page, 'approvals-page')
}

async function approvePendingSale(page) {
  const approveBtn = page.locator('button:has-text("Approve")').first()
  const visible = await approveBtn.isVisible().catch(() => false)
  if (!visible) {
    console.log('  ⚠ No pending approvals found')
    return false
  }
  await approveBtn.click()
  await page.waitForTimeout(500)
  await shot(page, 'approve-confirm-visible')

  // Confirm approval
  const confirmBtn = page.locator('button:has-text("Confirm Approval")').first()
  const confirmVisible = await confirmBtn.isVisible().catch(() => false)
  if (confirmVisible) {
    await confirmBtn.click()
    await page.waitForTimeout(1000)
    await shot(page, 'after-approval')
    return true
  }
  return false
}

// ── Main ─────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true })

// Read credentials from env or use placeholders
const CASHIER_EMAIL    = process.env.CASHIER_EMAIL    || 'cashier@test.com'
const CASHIER_PASS     = process.env.CASHIER_PASS     || 'password'
const MANAGER_EMAIL    = process.env.MANAGER_EMAIL    || 'manager@test.com'
const MANAGER_PASS     = process.env.MANAGER_PASS     || 'password'

const results = []

// ── Scenario 1: CASHIER applies discount → goes for approval ─────────────────
console.log('\n═══════════════════════════════════════')
console.log('SCENARIO 1: Cashier applies discount')
console.log('═══════════════════════════════════════')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  await login(page, CASHIER_EMAIL, CASHIER_PASS)
  await goToNewSale(page)
  const itemAdded = await addFirstItemToCart(page)

  if (itemAdded) {
    const discountApplied = await applyLineDiscount(page, 5)
    const noticeShown = discountApplied ? await checkApprovalNotice(page) : false
    await submitSale(page)
    const isPending = await checkPendingApprovalState(page)

    results.push({
      scenario: 'Cashier discount → approval',
      noticeShown,
      sentForApproval: isPending,
      pass: noticeShown && isPending,
    })
  } else {
    results.push({ scenario: 'Cashier discount → approval', pass: false, reason: 'No items available' })
  }

  await ctx.close()
}

// ── Scenario 2: BRANCH MANAGER applies discount → completes immediately ───────
console.log('\n═══════════════════════════════════════')
console.log('SCENARIO 2: Branch Manager applies discount (no approval)')
console.log('═══════════════════════════════════════')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  await login(page, MANAGER_EMAIL, MANAGER_PASS)
  await goToNewSale(page)
  const itemAdded = await addFirstItemToCart(page)

  if (itemAdded) {
    const discountApplied = await applyLineDiscount(page, 5)
    const noticeShown = discountApplied ? await checkApprovalNotice(page) : false
    const submitBtn = page.locator('button[type="submit"]').first()
    const btnLabel = await submitBtn.textContent()
    const isNormalButton = !btnLabel?.includes('Approval')

    results.push({
      scenario: 'Manager discount → direct complete',
      noticeShown: noticeShown,
      buttonIsNormal: isNormalButton,
      pass: !noticeShown && isNormalButton,
    })

    await shot(page, 'manager-discount-button-check')
  } else {
    results.push({ scenario: 'Manager discount → direct complete', pass: false, reason: 'No items' })
  }

  await ctx.close()
}

// ── Scenario 3: BRANCH MANAGER approves the pending sale ─────────────────────
console.log('\n═══════════════════════════════════════')
console.log('SCENARIO 3: Branch Manager approves pending sale')
console.log('═══════════════════════════════════════')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  await login(page, MANAGER_EMAIL, MANAGER_PASS)
  await goToApprovals(page)
  const approved = await approvePendingSale(page)

  results.push({
    scenario: 'Manager approves pending sale',
    approved,
    pass: approved,
  })

  await ctx.close()
}

await browser.close()

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log('TEST RESULTS')
console.log('═══════════════════════════════════════')
let allPass = true
for (const r of results) {
  const icon = r.pass ? '✅' : '❌'
  console.log(`${icon}  ${r.scenario}`)
  for (const [k, v] of Object.entries(r)) {
    if (k !== 'scenario' && k !== 'pass') console.log(`     ${k}: ${v}`)
  }
  if (!r.pass) allPass = false
}
console.log('\nScreenshots saved to:', SCREENSHOT_DIR)
console.log('Overall:', allPass ? '✅ ALL PASSED' : '❌ SOME FAILED')
process.exit(allPass ? 0 : 1)
