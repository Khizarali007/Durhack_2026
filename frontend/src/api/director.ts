import type { DirectorResult } from './types'
import { USE_MOCKS } from './config'
import { signalAccountChanged } from './accountSignal'
import { apiFetch, errorDetail } from './rest'
import { mockDirector } from '../mocks/mockDirector'

// Demo controls (P9). Mock only until Person 1 exposes a director API:
// against the real backend every call is a no-op that reports "not available".

export type ScenarioName = 'wemby_storm'

/** True when the buttons on /director actually do something. */
export const DIRECTOR_AVAILABLE = USE_MOCKS

const NOT_AVAILABLE: DirectorResult = {
  ok: false,
  detail: 'Not available: the director only works on mock data until Person 1 exposes an API',
}

export async function pauseMarket(): Promise<DirectorResult> {
  return USE_MOCKS ? mockDirector.pause() : NOT_AVAILABLE
}

export async function resumeMarket(): Promise<DirectorResult> {
  return USE_MOCKS ? mockDirector.resume() : NOT_AVAILABLE
}

/** Rewinds the market to the season start. `account: true` also gives the signed-in user a fresh H$100 (100,000 API accounting units). */
export async function resetMarket(options: { account?: boolean } = {}): Promise<DirectorResult> {
  if (!USE_MOCKS) return NOT_AVAILABLE
  const result = mockDirector.reset(options.account === true)
  signalAccountChanged()
  return result
}

export async function playScenario(name: ScenarioName): Promise<DirectorResult> {
  return USE_MOCKS ? mockDirector.playScenario(name) : NOT_AVAILABLE
}

/** Mock only: drops the socket for a couple of seconds so the reconnect state can be checked. */
export async function dropConnection(): Promise<DirectorResult> {
  return USE_MOCKS ? mockDirector.dropConnection() : NOT_AVAILABLE
}

export function isMarketPaused(): boolean {
  return USE_MOCKS ? mockDirector.isPaused() : false
}

/** 19 Feb 2025: the day before the official report rules Wembanyama out (real season data). */
export const WEMBY_STORM_EVE_T = Date.UTC(2025, 1, 19) / 1000

/**
 * Real backend: jump the shared replay forward to 19 Feb 2025 (accounts are kept on a
 * forward jump; it takes about a minute of processing). Mock: plays the scripted storm.
 */
export async function jumpToWembyStorm(): Promise<DirectorResult> {
  if (USE_MOCKS) return mockDirector.playScenario('wemby_storm')
  try {
    await apiFetch('/market/timeline', { method: 'POST', body: JSON.stringify({ target_t: WEMBY_STORM_EVE_T }) })
    return { ok: true, detail: 'Jumping to 19 Feb 2025. The season bar shows progress; it pauses there when it lands.' }
  } catch (err) {
    return { ok: false, detail: errorDetail(err) }
  }
}
