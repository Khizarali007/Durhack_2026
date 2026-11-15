// Run against the one-port demo (scripts/demo): these tests place virtual trades.
// Jonathan's roster setup and continuous season, behind Person 4's login, plus review and rivals.
import { test, expect } from '@playwright/test'

async function buildRoster(page) {
  await expect(page.getByRole('heading', { name: 'Build your roster' })).toBeVisible()
  const start = page.getByRole('button', { name: 'Start season', exact: true })
  await expect(start).toBeDisabled()
  const search = page.getByRole('searchbox', { name: 'Search players' })
  const players = page.getByRole('region', { name: 'Available players' })
  async function buy(name) {
    await search.fill(name)
    await players.getByRole('button', { name: new RegExp(name) }).click()
    const button = page.getByRole('button', { name: /^Buy \d+ shares$/ })
    await expect(button).toBeEnabled({ timeout: 20_000 })
    await button.click()
    await expect(page.getByRole('button', { name: `Manage ${name}`, exact: true })).toBeVisible()
  }
  await buy('Luka Doncic')
  await search.fill('')
  await page.getByLabel('Filter by team').selectOption('BOS')
  await buy('Jayson Tatum')
  await page.getByLabel('Filter by team').selectOption('')
  await buy('Stephen Curry')
  await expect(start).toBeEnabled()
  await start.click()
  const controls = page.getByRole('region', { name: 'Season challenge controls' })
  await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await controls.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(controls.getByRole('button', { name: 'Play season', exact: true })).toBeVisible()
}

test('sign up → roster → season → trade → Activity review → log out and back in keeps the account', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const name = `e2e_${Date.now().toString(36)}`

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('tab', { name: 'Sign up' }).click()
  await page.getByLabel('Username').fill(name)
  await page.getByLabel('Password').fill('hoops123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await buildRoster(page)

  // Buy and sell on a stock page (his simplified ticket).
  await page.goto('/stock/JOKIC')
  const ticket = page.getByRole('complementary', { name: /Order ticket for/ })
  await expect(ticket).toBeVisible()
  const buyButton = ticket.getByRole('button', { name: /^Buy/ }).last()
  await expect(buyButton).toBeEnabled({ timeout: 20_000 })
  await buyButton.click()
  await expect(page.locator('[data-tour="ticket-result"]')).toBeVisible({ timeout: 20_000 })

  await page.goto('/activity')
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await expect(page.getByText(/^You bought \d+ shares of Luka Doncic at H\$/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Explain with Coach Hoops/ }).click()
  await expect(page.getByText('A practice game, not financial advice.', { exact: false })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: /Weekly reports/ }).click()
  await expect(page.getByRole('heading', { name: 'Updates', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Username').fill(name)
  await page.getByLabel('Password').fill('wrong-pass')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Wrong username or password')
  await page.getByLabel('Password').fill('hoops123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  // Same account: straight to the Overview with the roster, no setup again.
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await expect(page.getByText('Luka Doncic').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('guest → roster → Friends Insights → rival page → rivals on the leaderboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Play as guest' }).click()
  await buildRoster(page)

  await page.getByRole('link', { name: /Friends/ }).click()
  await expect(page.getByRole('heading', { name: 'Friends', level: 1 })).toBeVisible()
  await expect(page.getByText(/· Simulated trader$/)).toHaveCount(5, { timeout: 15_000 })
  await page.getByText('Insights: you vs Maya').click()
  await expect(page.getByText(/^Maya owns \d+ players/)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: /Maya/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Maya', level: 1 })).toBeVisible()
  await page.goto('/leaderboard')
  await expect(page.getByText(/Simulated trader/).first()).toBeVisible({ timeout: 15_000 })
})
