import { apiFetch } from './rest'
import type { LearnLink, SeasonReview, ReviewSummary } from './review'

/** One practice rival's identity. Always a simulated trader, never a real person. */
export interface RivalProfile {
  id: string
  name: string
  persona: string
  strategy: string
  style: string
  simulated: boolean
  label: string
  /** Rivals' money is scaled to a H$100 start so it compares with yours. */
  scale_note?: string
}

/** A row on the Friends list (and mixed into the leaderboard). `id === 'you'` is the player. */
export interface RivalRow extends RivalProfile {
  rank: number
  return_pct: number
  equity: number
  payouts: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  trades: number
  /** Rival's return minus yours, in percentage points. */
  vs_you?: number
}

export interface EquityPoint {
  t: number
  equity: number
}

export interface CompositionSliceOut {
  key: string
  label: string
  value: number
  pct: number
}

export interface CompositionOut {
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  reason: string
  holdings: number
  teams: number
  top_player_pct: number
  top_team_pct: number
  by_player: CompositionSliceOut[]
  by_team: CompositionSliceOut[]
}

export interface RivalDetail {
  rival: RivalProfile
  review: SeasonReview
  your_summary: ReviewSummary
  equity: EquityPoint[]
  your_equity: EquityPoint[]
  composition: CompositionOut
  /** Values are scaled to a H$100 start; weight_pct is the share of the rival's holdings. */
  top_holdings: { symbol: string; name: string; qty: number; value: number; weight_pct: number }[]
}

export interface RivalComparison {
  rival: RivalProfile
  differences: string[]
  try: LearnLink
}

export function getRivals(): Promise<{ rows: RivalRow[] }> {
  return apiFetch<{ rows: RivalRow[] }>('/learning/rivals')
}

export function getRival(id: string): Promise<RivalDetail> {
  return apiFetch<RivalDetail>(`/learning/rivals/${encodeURIComponent(id)}`)
}

export function compareRival(id: string): Promise<RivalComparison> {
  return apiFetch<RivalComparison>(`/learning/rivals/${encodeURIComponent(id)}/compare`)
}
