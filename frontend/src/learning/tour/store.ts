// Tutorial progress: which tutorial is running, its current step, what the
// user did during it, and which tutorials are finished. Persisted in
// localStorage (wrapped in try/catch: private windows can throw).

import { useSyncExternalStore } from 'react'
import type { MarketEvent, Trade } from '../../api'
import type { SeenEvent, TutorialTrade } from './types'

const STORAGE_KEY = 'hs-learn-tour-v1'

export interface TutorialRun {
  step: number
  /** Steps whose action was done (so Back and Resume don't ask again). */
  done: number[]
  /** Steps that showed the "happens on its own in the live market" fallback. */
  fallback: number[]
  /** Fill ids and event keys already used to complete a step. */
  claimed: string[]
  /** step index -> the fill id or event key that completed it */
  claimedBy: Record<number, string>
  moments: string[]
  trades: TutorialTrade[]
  events: SeenEvent[]
}

export interface TourState {
  activeId: string | null
  /** True while the overlay is showing. Exit keeps the run so it can be resumed. */
  running: boolean
  runs: Record<string, TutorialRun>
  completed: Record<string, { at: number; trades: TutorialTrade[] }>
  /** Tutorial whose completion card is on screen. */
  finishedId: string | null
}

const EMPTY: TourState = { activeId: null, running: false, runs: {}, completed: {}, finishedId: null }

function freshRun(): TutorialRun {
  return { step: 0, done: [], fallback: [], claimed: [], claimedBy: {}, moments: [], trades: [], events: [] }
}

function load(): TourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<TourState>
    return { ...EMPTY, ...parsed, runs: parsed.runs ?? {}, completed: parsed.completed ?? {} }
  } catch {
    return EMPTY
  }
}

let state: TourState = load()
const listeners = new Set<() => void>()

function set(next: TourState): void {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be full or blocked: progress then lasts until the tab closes.
  }
  for (const fn of [...listeners]) fn()
}

function patchRun(id: string, fn: (run: TutorialRun) => TutorialRun): void {
  const run = state.runs[id]
  if (!run) return
  set({ ...state, runs: { ...state.runs, [id]: fn(run) } })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getTourState(): TourState {
  return state
}

export function useTourState(): TourState {
  return useSyncExternalStore(subscribe, getTourState, getTourState)
}

/* ---- Fills and headlines seen while a tutorial runs ---- */

let knownTradeIds: Set<string> | null = null

/** Called with the account's trades whenever they change. New fills during a run are recorded. */
export function syncTrades(trades: Trade[]): void {
  if (knownTradeIds === null) {
    // First snapshot after page load is history, never a tutorial action.
    knownTradeIds = new Set(trades.map((t) => t.trade_id))
    return
  }
  const fresh = trades.filter((t) => !knownTradeIds!.has(t.trade_id))
  if (fresh.length === 0) return
  for (const t of fresh) knownTradeIds.add(t.trade_id)
  const id = state.activeId
  if (!state.running || id === null) return
  const add: TutorialTrade[] = [...fresh].reverse().map((t) => ({
    trade_id: t.trade_id,
    symbol: t.symbol,
    side: t.side,
    qty: t.qty,
    price: t.price,
    fee: t.fee,
    reason: t.reason,
  }))
  patchRun(id, (run) => ({ ...run, trades: [...run.trades, ...add] }))
}

let eventSeq = 0

export function recordEvent(ev: MarketEvent): void {
  const id = state.activeId
  if (!state.running || id === null) return
  const seen: SeenEvent = { key: `${ev.t}:${ev.symbol}:${ev.kind}:${eventSeq++}`, symbol: ev.symbol, kind: ev.kind, headline: ev.headline }
  patchRun(id, (run) => ({ ...run, events: [...run.events, seen].slice(-50) }))
}

/* ---- Actions ---- */

export const tour = {
  /** Start from step 1 (also "Restart"). */
  start(id: string): void {
    set({ ...state, activeId: id, running: true, finishedId: null, runs: { ...state.runs, [id]: freshRun() } })
  },

  /** Continue where the user left off, or start if never started. */
  resume(id: string): void {
    if (!state.runs[id]) {
      tour.start(id)
      return
    }
    set({ ...state, activeId: id, running: true, finishedId: null })
  },

  /** Hide the overlay. The run is kept for "Resume". */
  exit(): void {
    set({ ...state, running: false })
  },

  goTo(step: number): void {
    const id = state.activeId
    if (id) patchRun(id, (run) => ({ ...run, step: Math.max(0, step) }))
  },

  markDone(step: number, claim?: string): void {
    const id = state.activeId
    if (!id) return
    patchRun(id, (run) => {
      if (run.done.includes(step)) return run
      return {
        ...run,
        done: [...run.done, step],
        claimed: claim ? [...run.claimed, claim] : run.claimed,
        claimedBy: claim ? { ...run.claimedBy, [step]: claim } : run.claimedBy,
      }
    })
  },

  markFallback(step: number): void {
    const id = state.activeId
    if (id) patchRun(id, (run) => (run.fallback.includes(step) ? run : { ...run, fallback: [...run.fallback, step] }))
  },

  /** Returns true the first time a moment is requested in this run. */
  claimMoment(moment: string): boolean {
    const id = state.activeId
    const run = id ? state.runs[id] : undefined
    if (!id || !run || run.moments.includes(moment)) return false
    patchRun(id, (r) => ({ ...r, moments: [...r.moments, moment] }))
    return true
  },

  finish(): void {
    const id = state.activeId
    if (!id) return
    const run = state.runs[id]
    const runs = { ...state.runs }
    delete runs[id]
    set({
      ...state,
      activeId: null,
      running: false,
      runs,
      finishedId: id,
      completed: { ...state.completed, [id]: { at: Date.now(), trades: run?.trades ?? [] } },
    })
  },

  dismissFinished(): void {
    set({ ...state, finishedId: null })
  },
}

export type TutorialStatus = 'not_started' | 'in_progress' | 'done' | 'coming_soon'

export function tutorialStatus(s: TourState, id: string, comingSoon: boolean): TutorialStatus {
  if (comingSoon) return 'coming_soon'
  if (s.runs[id]) return 'in_progress'
  if (s.completed[id]) return 'done'
  return 'not_started'
}
