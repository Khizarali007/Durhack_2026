import { useEffect, useSyncExternalStore } from 'react'
import { getRadarState } from './useRadar'
import { getCachedQuote } from './useMarketStream'
import { usePortfolio } from './accountStore'
import { useSession } from './useSession'
import type { RadarState } from './useRadar'

/** A personal alert: a player you hold got an injury warning (cloudy) or was ruled out (storm). */
export interface StormAlert {
  id: string
  symbol: string
  name: string
  state: Exclude<RadarState, 'calm'>
  qty: number
  /** Position value when the alert fired, API accounting units. */
  value: number
  /** Estimate: 5% of the value for a warning, 10% for a storm. */
  risk: number
  t: number
  read: boolean
  /** 'open' until the player acts: kept, or dismissed after protecting. */
  status: 'open' | 'kept' | 'closed'
}

const RANK: Record<RadarState, number> = { calm: 0, cloudy: 1, storm: 2 }
const KEY = 'hs-storm-alerts:'
let alerts: StormAlert[] = []
let owner = ''
const seen = new Map<string, RadarState>()
const listeners = new Set<() => void>()

function emit(next: StormAlert[]): void {
  alerts = next
  try {
    if (owner) localStorage.setItem(KEY + owner, JSON.stringify(next.slice(0, 50)))
  } catch {
    /* Storage is optional. */
  }
  listeners.forEach((fn) => fn())
}

function load(user: string): void {
  if (owner === user) return
  owner = user
  seen.clear()
  try {
    alerts = JSON.parse(localStorage.getItem(KEY + user) ?? '[]') as StormAlert[]
  } catch {
    alerts = []
  }
  listeners.forEach((fn) => fn())
}

export function updateAlert(id: string, patch: Partial<StormAlert>): void {
  emit(alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
}

export function markAllRead(): void {
  emit(alerts.map((a) => ({ ...a, read: true })))
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Watches the injury radar for players you hold; one alert per player and state. */
export function useStormAlerts(): StormAlert[] {
  const { session } = useSession()
  const { portfolio } = usePortfolio()
  const user = session?.user_id ?? ''

  useEffect(() => {
    if (!user || !portfolio) return
    load(user)
    const check = () => {
      const fresh: StormAlert[] = []
      for (const p of portfolio.positions) {
        if (p.qty <= 0) continue
        const state = getRadarState(p.symbol)
        const before = seen.get(p.symbol)
        seen.set(p.symbol, state)
        if (state === 'calm' || before === undefined || RANK[state] <= RANK[before]) continue
        const id = `${p.symbol}:${state}`
        if (alerts.some((a) => a.id === id) || fresh.some((a) => a.id === id)) continue
        const q = getCachedQuote(p.symbol)
        const price = q?.quoted_price ?? q?.last ?? 0
        const value = p.qty * price
        fresh.push({
          id, symbol: p.symbol, name: p.name ?? p.symbol, state, qty: p.qty, value,
          risk: value * (state === 'storm' ? 0.1 : 0.05), t: Date.now(), read: false, status: 'open',
        })
      }
      if (fresh.length) emit([...fresh, ...alerts])
    }
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [user, portfolio])

  return useSyncExternalStore(subscribe, () => alerts)
}
