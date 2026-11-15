import { apiFetch } from './rest'

/** GET/POST /market/timeline: where the shared season replay is. */
export interface Timeline {
  t: number
  start_t: number
  end_t: number
  paused: boolean
  busy: boolean
  rate: number
  session_id: string
  error: string | null
}

export interface TimelineChange {
  paused?: boolean
  rate?: number
  target_t?: number
}

/** GET /trading/season-score: what the account would be worth if it sold everything now. */
export interface SeasonScore {
  score: number
  cash: number
  net_sale_proceeds: number
  pending_payouts: number
  payouts_received: number
  return_pct: number
  finished: boolean
  unsold_shares: Record<string, number>
}

/** One performance payment credited to the account (GET /trading/payouts). */
export interface Payout {
  payout_id?: string
  symbol: string
  qty_held: number
  amount: number
  t: number
  game_score: number | null
}

export function getTimeline(): Promise<Timeline> {
  return apiFetch<Timeline>('/market/timeline')
}

export function changeTimeline(change: TimelineChange): Promise<Timeline> {
  return apiFetch<Timeline>('/market/timeline', { method: 'POST', body: JSON.stringify(change) })
}

export function getSeasonScore(): Promise<SeasonScore> {
  return apiFetch<SeasonScore>('/season-score')
}

export function getPayouts(limit = 1000): Promise<Payout[]> {
  return apiFetch<Payout[]>(`/payouts?limit=${limit}`)
}
