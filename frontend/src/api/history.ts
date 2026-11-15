import { apiFetch } from './rest'
import type { MarketEventKind } from './types'

/** One revealed observation of a player: bid/ask midpoint and the analyst estimate. */
export interface HistoryPoint {
  t: number
  mid: number | null
  fair: number
  last?: number
  bid?: number | null
  ask?: number | null
}

export interface HistoryResponse {
  session_id: string
  history: Record<string, HistoryPoint[]>
}

/** An official injury-report event (GET /market/events), newest first. */
export interface OfficialEvent {
  t: number
  symbol: string
  kind: MarketEventKind
  headline: string
  impact: number
  storm: number
}

/** Up to four players' season so far. Called once per selection, not per tick. */
export function getHistory(symbols: string[]): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(`/market/history?symbols=${symbols.map(encodeURIComponent).join(',')}`)
}

export function getOfficialEvents(limit = 500): Promise<OfficialEvent[]> {
  return apiFetch<OfficialEvent[]>(`/market/events?limit=${limit}`)
}

/** GET /market/valuation/{symbol}: the analyst model behind a player's estimate. */
export interface Valuation {
  next_game_expected_payout: number
  underlying_ability: number
  recent_form: number
  last_game_score: number | null
  last_game_day: string | null
  games_observed: number
  injury_status: string
  injury_reason: string
  confidence: string
}

export function getValuation(symbol: string): Promise<Valuation> {
  return apiFetch<Valuation>(`/market/valuation/${encodeURIComponent(symbol)}`)
}
