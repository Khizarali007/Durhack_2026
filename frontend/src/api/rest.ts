import type {
  SessionOut, MeOut, OrderIn, OrderOut, PortfolioOut, Player, CandleData, Timeframe,
  OrderSide, OrderQuote, OpenOrderIn, OpenOrder, Trade, LeaderboardRow, MarginOrderIn, EquityPoint,
} from './types'
import { ApiError } from './types'
import {
  USE_MOCKS, API_BASE, getStoredToken, setStoredToken, setStoredUserId, clearStoredToken,
} from './config'
import { signalAccountChanged } from './accountSignal'
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

function storeSession(s: SessionOut): SessionOut {
  setStoredToken(s.token)
  setStoredUserId(s.user_id)
  return s
}

/** The plain-words reason from an ApiError (`body.detail`), or a fallback. */
export function errorDetail(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) {
    const body = err.body
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string' && detail.trim() !== '') {
        return detail.charAt(0).toUpperCase() + detail.slice(1)
      }
      // FastAPI validation errors arrive as a list of { msg }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: unknown }
        if (typeof first?.msg === 'string') return first.msg.charAt(0).toUpperCase() + first.msg.slice(1)
      }
    }
    if (err.status === 401) return 'You are signed out. Please join again.'
    if (err.status === 404) return 'Not available yet.'
  }
  return fallback
}

// ============================================================
// Built by the team: shapes confirmed, do not change
// ============================================================

export async function createSession(): Promise<SessionOut> {
  if (USE_MOCKS) return storeSession(mockRest.createSession())
  return storeSession(await apiFetch<SessionOut>('/session', { method: 'POST' }))
}

export async function getMe(): Promise<MeOut> {
  if (USE_MOCKS) return mockRest.getMe()
  return apiFetch<MeOut>('/me')
}

export async function placeOrder(input: OrderIn): Promise<OrderOut> {
  const out = USE_MOCKS
    ? mockRest.placeOrder(input)
    : await apiFetch<OrderOut>('/orders', { method: 'POST', body: JSON.stringify(input) })
  signalAccountChanged()
  return out
}

export async function getPortfolio(): Promise<PortfolioOut> {
  if (USE_MOCKS) return mockRest.getPortfolio()
  return apiFetch<PortfolioOut>('/portfolio')
}

export async function getPlayers(): Promise<Player[]> {
  if (USE_MOCKS) return mockRest.getPlayers()
  return apiFetch<Player[]>('/players')  // PROPOSAL: endpoint not yet confirmed
}

export async function getCandles(symbol: string, timeframe: Timeframe): Promise<CandleData[]> {
  if (USE_MOCKS) return mockRest.getCandles(symbol, timeframe)
  return apiFetch<CandleData[]>(`/candles/${symbol}?timeframe=${timeframe}`)  // PROPOSAL
}

// ============================================================
// Not built yet. Every function below is a guess at Person 2's API.
// ============================================================

// PLANNED: shape guessed, confirm with Person 2
/** Estimate of what an order would cost right now, walked through the makers in 10-share chunks. */
export async function getOrderQuote(symbol: string, side: OrderSide, qty: number, leverage: 1 | 3 = 1): Promise<OrderQuote> {
  if (USE_MOCKS) return mockRest.getOrderQuote(symbol, side, qty, leverage)
  return apiFetch<OrderQuote>('/orders/quote', { method: 'POST', body: JSON.stringify({ symbol, side, qty, leverage }) })
}

// PLANNED: shape guessed, confirm with Person 2
/** Places a resting limit or stop-loss order. */
export async function placeOpenOrder(input: OpenOrderIn): Promise<OpenOrder> {
  const out = USE_MOCKS
    ? mockRest.placeOpenOrder(input)
    : await apiFetch<OpenOrder>('/orders/open', { method: 'POST', body: JSON.stringify(input) })
  signalAccountChanged()
  return out
}

// PLANNED: shape guessed, confirm with Person 2
export async function getOpenOrders(): Promise<OpenOrder[]> {
  if (USE_MOCKS) return mockRest.getOpenOrders()
  return apiFetch<OpenOrder[]>('/orders/open')
}

// PLANNED: shape guessed, confirm with Person 2
export async function cancelOrder(orderId: string): Promise<OpenOrder> {
  const out = USE_MOCKS
    ? mockRest.cancelOrder(orderId)
    : await apiFetch<OpenOrder>(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' })
  signalAccountChanged()
  return out
}

// PLANNED: shape guessed, confirm with Person 2
/** Your fills, newest first, each with its Solana receipt state. */
export async function getTrades(): Promise<Trade[]> {
  if (USE_MOCKS) return mockRest.getTrades()
  return apiFetch<Trade[]>('/trades')
}

// PLANNED: shape guessed, confirm with Person 2
export async function signup(username: string, password: string): Promise<SessionOut> {
  if (USE_MOCKS) return storeSession(mockRest.signup(username, password))
  return storeSession(await apiFetch<SessionOut>('/signup', { method: 'POST', body: JSON.stringify({ username, password }) }))
}

// PLANNED: shape guessed, confirm with Person 2
export async function login(username: string, password: string): Promise<SessionOut> {
  if (USE_MOCKS) return storeSession(mockRest.login(username, password))
  return storeSession(await apiFetch<SessionOut>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }))
}

/** A funded guest account in one call. Same as the existing POST /trading/session. */
export async function guestSession(): Promise<SessionOut> {
  return createSession()
}

// PLANNED: shape guessed, confirm with Person 2
export async function logout(): Promise<void> {
  try {
    if (USE_MOCKS) mockRest.logout()
    else await apiFetch<unknown>('/logout', { method: 'POST' })
  } catch { /* signing out locally is enough */ }
  clearStoredToken()
}

// PLANNED: shape guessed, confirm with Person 2
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  if (USE_MOCKS) return mockRest.getLeaderboard()
  return apiFetch<LeaderboardRow[]>('/leaderboard')
}

// PLANNED: shape guessed, confirm with Person 2
/** Market order that can open a short, cover one, or use 3x leverage. */
export async function placeMarginOrder(input: MarginOrderIn): Promise<OrderOut> {
  const out = USE_MOCKS
    ? mockRest.placeMarginOrder(input)
    : await apiFetch<OrderOut>('/orders', { method: 'POST', body: JSON.stringify(input) })
  signalAccountChanged()
  return out
}

// PLANNED: shape guessed, confirm with Person 2
/** Account equity sampled once per market minute, oldest first. */
export async function getEquityHistory(): Promise<EquityPoint[]> {
  if (USE_MOCKS) return mockRest.getEquityHistory()
  return apiFetch<EquityPoint[]>('/equity/history')
}
