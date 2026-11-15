import { useEffect, useSyncExternalStore } from 'react'
import { apiFetch } from './rest'
import { USE_MOCKS } from './config'
import { usePortfolio } from './accountStore'
import type { PortfolioOut } from './types'

/** One slice of the basket, by player or by team. GET /learning/composition. */
export interface CompositionSlice { key: string; label: string; value: number; pct: number }

export type CompositionGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface Composition {
  /** null while everything is still cash. */
  grade: CompositionGrade | null
  reason: string
  invested: number
  cash: number
  cash_pct: number
  holdings: number
  teams: number
  /** 1 / HHI: how many equal-sized positions the basket behaves like. */
  effective_holdings: number
  hhi: number
  top_player_pct: number
  top_team_pct: number
  by_player: CompositionSlice[]
  by_team: CompositionSlice[]
}

interface CompositionState { composition: Composition | null; unavailable: boolean }

// One shared copy for the panel and the header chip; refreshed when the portfolio changes.
let state: CompositionState = { composition: null, unavailable: USE_MOCKS }
const listeners = new Set<() => void>()
let lastPortfolio: PortfolioOut | null = null
let inflight = false
let pending = false
let lastAt = 0
let timer: ReturnType<typeof setTimeout> | null = null
const MIN_GAP_MS = 2000

function emit(next: CompositionState): void {
  state = next
  for (const fn of [...listeners]) fn()
}

async function load(): Promise<void> {
  if (inflight) { pending = true; return }
  inflight = true
  lastAt = Date.now()
  try {
    emit({ composition: await apiFetch<Composition>('/learning/composition'), unavailable: false })
  } catch {
    // Keep the last grade on a hiccup; only say "unavailable" if we never had one.
    emit({ ...state, unavailable: state.composition === null })
  } finally {
    inflight = false
    if (pending) { pending = false; schedule() }
  }
}

function schedule(): void {
  if (USE_MOCKS || timer !== null) return
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastAt))
  timer = setTimeout(() => { timer = null; void load() }, wait)
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
function getSnapshot(): CompositionState { return state }

/** The signed-in player's basket graded A–F (backend: learning/composition.py). */
export function useComposition(): CompositionState {
  const { portfolio } = usePortfolio()
  const current = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => {
    if (portfolio && portfolio !== lastPortfolio) {
      lastPortfolio = portfolio
      schedule()
    }
  }, [portfolio])
  return current
}
