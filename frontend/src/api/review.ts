import { apiFetch } from './rest'

/** Where a review card sends you to learn the lesson. */
export interface LearnLink {
  kind: 'tutorial' | 'glossary'
  id: string
  label: string
}

/** One review card from the insights engine (backend/learning/insights.py). */
export interface Insight {
  id: string
  tone: 'warning' | 'praise'
  title: string
  what: string
  why: string
  next_time: string
  impact: number
  learn: LearnLink
  symbol: string | null
  t: number | null
}

export interface TimelineItem {
  t: number
  kind: 'buy' | 'sell' | 'payout' | 'alert' | 'grade'
  text: string
  symbol: string | null
  amount: number | null
}

export interface TradeResult {
  symbol: string
  qty: number
  pnl: number
  t: number
}

export interface ReviewSummary {
  equity: number
  return_pct: number
  payouts: number
  fees: number
  trades: number
  best_trade: TradeResult | null
  worst_trade: TradeResult | null
  max_drawdown_pct: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  grade_reason: string
  biggest_lesson: string
}

export interface SeasonReview {
  name: string
  summary: ReviewSummary
  insights: Insight[]
  timeline: TimelineItem[]
}

export interface CoachAnswer {
  bullets: string[]
  source: 'gemini' | 'template'
}

/** GET /learning/review: your season so far, explained. */
export function getReview(): Promise<SeasonReview> {
  return apiFetch<SeasonReview>('/learning/review')
}

/** POST /learning/coach: Coach Hoops' three bullets, about you or you vs a rival. */
export function askCoach(rivalId?: string): Promise<CoachAnswer> {
  return apiFetch<CoachAnswer>('/learning/coach', {
    method: 'POST',
    body: JSON.stringify(rivalId ? { rival_id: rivalId } : {}),
  })
}
