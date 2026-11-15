// Playwright smoke test for the real one-port build (scripts/demo).
// Uses the installed Google Chrome, so no browser download is needed.
import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL, channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true, viewport: { width: 1440, height: 900 } },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'SKIP_BUILD=1 ../scripts/demo',
    url: `${baseURL}/market/status`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
