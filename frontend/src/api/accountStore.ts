import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PortfolioOut, OpenOrder, Trade, EquityPoint, LeaderboardRow } from './types'
import { ApiError } from './types'
import { USE_MOCKS } from './config'
import { getPortfolio, getOpenOrders, getTrades, getEquityHistory, getLeaderboard } from './rest'
import { onAccountChanged } from './accountSignal'
import { getSessionSnapshot, subscribeSession } from './useSession'
import {
  subscribeOrderUpdates, subscribeReceipts, subscribeMarginCalls, subscribeMarketReset,
} from './useMarketStream'
import { reservedCash } from './orderMath'

// The signed-in user's portfolio, open orders and trades, shared by every screen.
// The portfolio is polled so equity keeps moving with prices. Orders and trades
// reload when something happens to them.

interface AccountSnapshot {
  portfolio: PortfolioOut | null
  openOrders: OpenOrder[]
  trades: Trade[]
  loading: boolean
}

const POLL_MS = USE_MOCKS ? 1000 : 2000
/** Without a confirmed per-user socket, the real backend also gets a slow full reload. */
const FULL_RELOAD_EVERY = USE_MOCKS ? 0 : 3

const EMPTY: AccountSnapshot = { portfolio: null, openOrders: [], trades: [], loading: true }

let snap: AccountSnapshot = EMPTY
let userId: string | null = null
let subscriberCount = 0
let timer: ReturnType<typeof setInterval> | null = null
let pollCount = 0
let generation = 0
const listeners = new Set<() => void>()

function set(next: AccountSnapshot): void {
  snap = next
  for (const fn of [...listeners]) fn()
}

async function loadPortfolio(): Promise<void> {
  if (userId === null) return
  const gen = generation
  try {
    const portfolio = await getPortfolio()
    if (gen === generation) set({ ...snap, portfolio, loading: false })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return // Forward replay: preserve the last snapshot.
    // Clear unavailable accounts; replay itself keeps the last snapshot.
    if (gen === generation) set({ ...snap, portfolio:null, loading:false })
  }
}

/** Reloads portfolio, open orders and trades. Planned endpoints that fail keep their last value. */
export async function refreshAccount(): Promise<void> {
  if (userId === null) return
  const gen = generation
  const [p, o, t] = await Promise.allSettled([getPortfolio(), getOpenOrders(), getTrades()])
  if (gen !== generation) return
  set({
    portfolio: p.status === 'fulfilled' ? p.value : p.reason instanceof ApiError && p.reason.status === 409 ? snap.portfolio : null,
    openOrders: o.status === 'fulfilled' ? o.value : snap.openOrders,
    trades: t.status === 'fulfilled' ? t.value : snap.trades,
    loading: false,
  })
}

function syncUser(): void {
  const next = getSessionSnapshot().session?.user_id ?? null
  if (next === userId) return
  userId = next
  generation++
  set(next === null ? { ...EMPTY, loading: false } : EMPTY)
  void refreshAccount()
}

subscribeSession(syncUser)
onAccountChanged(() => { syncUser(); void refreshAccount() })
subscribeOrderUpdates(() => { void refreshAccount() })
subscribeReceipts(() => { void refreshAccount() })
subscribeMarginCalls(() => { void refreshAccount() })
subscribeMarketReset(() => { generation++; lastGoodLeaderboard=[]; set({...EMPTY,loading:false}); void refreshAccount() })

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  subscriberCount++
  if (timer === null) {
    syncUser()
    timer = setInterval(() => {
      pollCount++
      if (FULL_RELOAD_EVERY > 0 && pollCount % FULL_RELOAD_EVERY === 0) void refreshAccount()
      else void loadPortfolio()
    }, POLL_MS)
  }
  return () => {
    listeners.delete(fn)
    subscriberCount--
    if (subscriberCount === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): AccountSnapshot { return snap }

export function usePortfolio(): { portfolio: PortfolioOut | null; loading: boolean } {
  const s = useSyncExternalStore(subscribe, getSnapshot)
  return { portfolio: s.portfolio, loading: s.loading }
}

/** Open limit and stop orders, optionally for one stock. */
export function useOpenOrders(symbol?: string): OpenOrder[] {
  const { openOrders } = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo(
    () => (symbol ? openOrders.filter(o => o.symbol === symbol) : openOrders),
    [openOrders, symbol],
  )
}

export function useTrades(): Trade[] {
  return useSyncExternalStore(subscribe, getSnapshot).trades
}

/** Cash held back by open limit buys. */
export function useReservedCash(): number {
  const { openOrders } = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo(() => reservedCash(openOrders), [openOrders])
}

/** Equity over time, re-read once per market minute (5 real seconds). */
export function useEquityHistory(): { points: EquityPoint[]; loading: boolean } {
  const [state, setState] = useState<{ points: EquityPoint[]; loading: boolean }>({ points: [], loading: true })

  useEffect(() => {
    let alive = true
    const load = () => {
      getEquityHistory()
        .then(points => { if (alive) setState({ points, loading: false }) })
        .catch(() => { if (alive) setState(prev => ({ points: prev.points, loading: false })) })
    }
    load()
    const id = setInterval(load, 5000)
    const offReset = subscribeMarketReset(load)
    return () => { alive = false; clearInterval(id); offReset() }
  }, [])

  return state
}

let lastGoodLeaderboard: LeaderboardRow[] = []

/**
 * Leaderboard rows, refreshed every few seconds. If a fetch fails (for example
 * the chain read), the last good list stays on screen with no error.
 */
export function useLeaderboard(): { rows: LeaderboardRow[]; loading: boolean } {
  const [state, setState] = useState<{ rows: LeaderboardRow[]; loading: boolean }>(
    () => ({ rows: lastGoodLeaderboard, loading: lastGoodLeaderboard.length === 0 }),
  )

  useEffect(() => {
    let alive = true
    const load = () => {
      getLeaderboard()
        .then(rows => {
          lastGoodLeaderboard = rows
          if (alive) setState({ rows, loading: false })
        })
        .catch(() => { if (alive) setState({ rows: [], loading: false }) })
    }
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return state
}

export function learningPortfolio(): PortfolioOut | null { return snap.portfolio }
