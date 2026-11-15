import type { DirectorResult } from './types'
import { USE_MOCKS } from './config'
import { signalAccountChanged } from './accountSignal'
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

/** Rewinds the market to the season start. `account: true` also gives the signed-in user a fresh 100,000 HOOP. */
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
