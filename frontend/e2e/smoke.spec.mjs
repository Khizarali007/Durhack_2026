// Core loop: join as guest -> first purchase -> advance the market -> payout -> sell -> score, then Learn.
import { test, expect } from '@playwright/test'

const hoop = (text) => Number(text.replace(/[^0-9.-]/g, ''))

test('guest buys, the season pays out, guest sells, score shows; Learn opens', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Back your basketball judgement.' })).toBeVisible()
  const buy = page.getByRole('button', { name: 'Buy shares and enter the season' })
  await expect(buy).toBeEnabled({ timeout: 20_000 })
  await buy.click()

  const controls = page.getByRole('region', { name: 'Season challenge controls' })
  await expect(controls).toBeVisible()
  const credited = controls.getByText('Payouts credited:').locator('b')

  // Replay day by day until a game payout lands (Jokic's first game is on day 3).
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

  await page.goto('/learn')
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})
