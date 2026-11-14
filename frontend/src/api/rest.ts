import type { SessionOut, MeOut, OrderIn, OrderOut, PortfolioOut, Player, CandleData } from './types'
import { ApiError } from './types'
import { USE_MOCKS, API_BASE, getStoredToken, setStoredToken, setStoredUserId } from './config'
import { mockRest } from '../mocks/mockRest'

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export async function createSession(): Promise<SessionOut> {
  if (USE_MOCKS) {
    const s = mockRest.createSession()
    setStoredToken(s.token)
    setStoredUserId(s.user_id)
    return s
  }
  return apiFetch<SessionOut>('/session', { method: 'POST' })
}

export async function getMe(): Promise<MeOut> {
  if (USE_MOCKS) return mockRest.getMe()
  return apiFetch<MeOut>('/me')
}

export async function placeOrder(input: OrderIn): Promise<OrderOut> {
  if (USE_MOCKS) return mockRest.placeOrder(input)
  return apiFetch<OrderOut>('/orders', { method: 'POST', body: JSON.stringify(input) })
}

export async function getPortfolio(): Promise<PortfolioOut> {
  if (USE_MOCKS) return mockRest.getPortfolio()
  return apiFetch<PortfolioOut>('/portfolio')
}

export async function getPlayers(): Promise<Player[]> {
  if (USE_MOCKS) return mockRest.getPlayers()
  return apiFetch<Player[]>('/players')  // PROPOSAL: endpoint not yet confirmed
}

export async function getCandles(symbol: string, timeframe: '1m' | '5m' | '1h' | '1d'): Promise<CandleData[]> {
  if (USE_MOCKS) return mockRest.getCandles(symbol, timeframe)
  return apiFetch<CandleData[]>(`/candles/${symbol}?timeframe=${timeframe}`)  // PROPOSAL
}
