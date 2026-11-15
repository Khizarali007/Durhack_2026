import { useEffect, useState } from 'react'
import { apiFetch } from './rest'
import { USE_MOCKS } from './config'
import { getCachedQuote, getSparklineBuffer, subscribeSparkline, subscribeTime, subscribeMarketReset } from './useMarketStream'

// Season sparklines: every player's recent daily midpoints, fetched once per market day
// (GET /market/sparklines), plus today's live midpoint at the end. No per-tick reloads.

const DAY = 86400
let daily = new Map<string, number[]>()
let loadedDay = -1
let inflight = false
const listeners = new Set<() => void>()

async function refresh(day: number): Promise<void> {
  if (inflight || USE_MOCKS) return
  inflight = true
  try {
    const data = await apiFetch<{ prices: Record<string, number[]> }>('/market/sparklines?days=30')
    daily = new Map(Object.entries(data.prices))
    loadedDay = day
    for (const fn of [...listeners]) fn()
  } catch {
    // Keep the old lines; the next market day tries again.
  } finally {
    inflight = false
  }
}

if (!USE_MOCKS) {
  subscribeTime((t) => {
    const day = Math.floor(t / DAY)
    if (day !== loadedDay) void refresh(day)
  })
  subscribeMarketReset(() => {
    loadedDay = -1
  })
}

/** Daily season prices for a player, ending with the live midpoint. */
export function useSparkline(symbol: string): number[] {
  const [, setVersion] = useState(0)
  const [ticks, setTicks] = useState<number[]>(() => getSparklineBuffer(symbol))

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])

  // Mock mode has no daily history, so it keeps the tick buffer.
  useEffect(() => (USE_MOCKS ? subscribeSparkline(symbol, setTicks) : undefined), [symbol])

  if (USE_MOCKS) return ticks
  const history = daily.get(symbol) ?? []
  const live = getCachedQuote(symbol)
  const now = live ? (live.quoted_price ?? live.last) : null
  return now == null ? history : [...history, now]
}
