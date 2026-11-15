// Core loop and accounts on the real one-port build (scripts/demo).
import { test, expect } from '@playwright/test'

const hoop = (text) => Number(text.replace(/[^0-9.-]/g, ''))

test('guest: login page → welcome quick buy → next days pay out → sell → score; Learn opens', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Play as guest' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to HoopStreet' })).toBeVisible()
  await page.getByRole('button', { name: 'Make your first investment' }).click()
  const buy = page.getByRole('button', { name: 'Buy 10 JOKIC' })
  await expect(buy).toBeEnabled({ timeout: 20_000 })
  await buy.click()
  await expect(page.getByText(/^Bought 10 JOKIC/)).toBeVisible()

  const controls = page.getByRole('region', { name: 'Season challenge controls' })
  const credited = controls.getByText('Payouts credited:').locator('b')
  for (let day = 0; day < 6 && hoop(await credited.innerText()) <= 0; day++) {
    const next = controls.getByRole('button', { name: 'Next day' })
    await expect(next).toBeEnabled({ timeout: 30_000 })
    await next.click()
    await page.waitForTimeout(1500)
  }
  await expect.poll(async () => hoop(await credited.innerText()), { timeout: 30_000 }).toBeGreaterThan(0)

  await page.goto('/stock/JOKIC')
  const ticket = page.getByRole('complementary', { name: /Order ticket for/ })
  await ticket.getByRole('radio', { name: 'Sell' }).or(ticket.getByRole('button', { name: 'Sell', exact: true })).first().click()
  await ticket.getByRole('button', { name: 'Max' }).click()
  const sell = ticket.getByRole('button', { name: /^Sell \d/ })
  await expect(sell).toBeEnabled({ timeout: 20_000 })
  await sell.click()
  await expect(page.locator('[data-tour="ticket-result"]')).toBeVisible({ timeout: 20_000 })
  await expect(controls.getByText(/Estimated exit value: -?H\$/)).toBeVisible({ timeout: 20_000 })

  // One more trade, still held: the review must now have a card about it.
  await page.goto('/stock/SGA')
  const sgaBuy = page.getByRole('complementary', { name: /Order ticket for/ }).getByRole('button', { name: /^Buy 10 SGA/ })
  await expect(sgaBuy).toBeEnabled({ timeout: 20_000 })
  await sgaBuy.click()
  await expect(page.locator('[data-tour="ticket-result"]')).toBeVisible({ timeout: 20_000 })

  await page.goto('/activity')
  await expect(page.getByRole('heading', { name: 'Your season review' })).toBeVisible()
  await expect(page.locator('article').filter({ hasText: 'on one player' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/^You bought 10 JOKIC at H\$/)).toBeVisible()
  await page.getByRole('button', { name: 'Explain with Coach Hoops' }).click()
  await expect(page.getByText(/Coach Hoops · /)).toBeVisible({ timeout: 15_000 })

  await page.goto('/learn')
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('sign up, log out, log back in; wrong password is explained', async ({ page }) => {
  const name = `e2e_${Date.now().toString(36)}`
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Sign up' }).click()
  await page.getByLabel('Username').fill(name)
  await page.getByLabel('Password').fill('hoops123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Top movers' })).toBeVisible()

  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Username').fill(name)
  await page.getByLabel('Password').fill('wrong-pass')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Wrong username or password')
  await page.getByLabel('Password').fill('hoops123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Top movers' })).toBeVisible()
})

test('Friends lists five simulated rivals, opens Insights, and rivals fill the leaderboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Play as guest' }).click()
  await expect(page.getByRole('heading', { name: 'Top movers' })).toBeVisible()
  await page.getByRole('link', { name: /Friends/ }).click()
  await expect(page.getByRole('heading', { name: 'Friends', level: 1 })).toBeVisible()
  await expect(page.getByText('Simulated trader', { exact: true })).toHaveCount(5, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Insights: you vs Maya' }).click()
  await expect(page.getByRole('heading', { name: 'What Maya did differently' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/^Maya holds \d+ players/)).toBeVisible()

  await page.getByRole('link', { name: /Maya/ }).first().click()
  await expect(page.getByRole('heading', { name: /Maya/, level: 1 })).toBeVisible()
  await page.goto('/leaderboard')
  await expect(page.getByText('Simulated', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
})
