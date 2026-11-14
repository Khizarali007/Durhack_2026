import { useMemo, useSyncExternalStore } from 'react'
import type { MarketEvent, FinalWhistleMessage, FinalWhistleLine } from './types'
import { subscribeEvents, subscribeWhistle, subscribeMarketReset } from './useMarketStream'

// Remembers what the stream has said since the page loaded: recent events (for the
// headline ticker, chart markers and "Why did it move?") and final-whistle lines.
// There is no history endpoint for events yet: see docs/ui-progress.md, questions for Person 1.

const MAX_EVENTS = 200

export interface WhistleEntry { line: FinalWhistleLine; t: number }

interface LogSnapshot {
  /** Newest first. */
  events: MarketEvent[]
  whistle: FinalWhistleMessage | null
  whistleBySymbol: ReadonlyMap<string, WhistleEntry>
}

let snap: LogSnapshot = { events: [], whistle: null, whistleBySymbol: new Map() }
const listeners = new Set<() => void>()

function set(next: LogSnapshot): void {
  snap = next
  for (const fn of [...listeners]) fn()
}

subscribeEvents(ev => {
  set({ ...snap, events: [ev, ...snap.events].slice(0, MAX_EVENTS) })
})

subscribeWhistle(msg => {
  const bySymbol = new Map(snap.whistleBySymbol)
  for (const line of msg.lines) {
    if (line && typeof line.symbol === 'string') bySymbol.set(line.symbol, { line, t: msg.t })
  }
  set({ ...snap, whistle: msg, whistleBySymbol: bySymbol })
})

subscribeMarketReset(() => {
  set({ events: [], whistle: null, whistleBySymbol: new Map() })
})

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
function getSnapshot(): LogSnapshot { return snap }

/** Recent market events, newest first. */
export function useEventLog(): MarketEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot).events
}

/** Recent events for one stock, newest first. */
export function useSymbolEvents(symbol: string): MarketEvent[] {
  const events = useEventLog()
  return useMemo(() => events.filter(e => e.symbol === symbol), [events, symbol])
}

/** The most recent final whistle, or null before the first one. */
export function useLatestWhistle(): FinalWhistleMessage | null {
  return useSyncExternalStore(subscribe, getSnapshot).whistle
}

/** This player's line from the most recent whistle that mentioned them. */
export function useWhistleLine(symbol: string): WhistleEntry | null {
  return useSyncExternalStore(subscribe, getSnapshot).whistleBySymbol.get(symbol) ?? null
}
