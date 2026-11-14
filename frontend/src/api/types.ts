// Mirrors Python backend shapes exactly. Comments indicate the source file.

// --- From router.py (origin/person2branch) ---

export interface SessionOut { token: string; user_id: string; cash: number }
export interface MeOut { user_id: string; username: string | null; is_guest: boolean; cash: number }
export interface OrderIn { symbol: string; side: 'buy' | 'sell'; qty: number }
export interface FillOut {
  trade_id: string; qty: number; price: number; fee: number
  t: number; counterparty: string
}
export interface OrderOut {
  order_id: string; status: 'filled' | 'partially_filled'
  symbol: string; side: 'buy' | 'sell'
  requested_qty: number; filled_qty: number; average_price: number
  total_fee: number; cash: number; position_qty: number
  fills: FillOut[]; reason: string | null
}
export interface PositionOut {
  symbol: string; name: string | null; team: string | null; qty: number
  avg_cost: number; last_price: number; market_value: number
  unrealised_pnl: number; unrealised_pnl_pct: number; weight_pct: number
}
export interface PortfolioOut {
  user_id: string; cash: number; positions_value: number; equity: number
  starting_cash: number; total_pnl: number; total_pnl_pct: number
  unrealised_pnl: number; realised_pnl: number; fees_paid: number
  positions: PositionOut[]
}

// --- From market_contract.py (origin/person2branch) ---

export interface Player { player_id: number; symbol: string; name: string; team: string; start_price: number }
export interface MakerQuote { maker_id: string; bid: number | null; ask: number | null; shares: number }
export interface Quote {
  symbol: string; bid: number | null; ask: number | null
  last: number; fair_value: number; makers: MakerQuote[]
}
export interface MarketTick { t: number; quotes: Record<string, Quote> }

// --- From person4-interfaces.md (origin/person4-learning) --- kept for Person 4 compatibility

export interface Tick {
  t: number; symbol: string; price: number
  fair_value: number; best_bid: number; best_ask: number
}

export type MarketEventKind = 'early_warning' | 'injury' | 'hot_streak' | 'rest_day' | 'trade_rumour'
export interface MarketEvent {
  t: number; symbol: string; kind: MarketEventKind
  headline: string; impact: number; storm: number
}

// --- Candles (for lightweight-charts) ---

export interface CandleData {
  time: number; open: number; high: number; low: number; close: number
  isLive?: boolean
}

// --- ApiError: explicit field declarations (erasableSyntaxOnly bans constructor parameter properties) ---

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

// --- Final-whistle message ---

export interface FinalWhistleLine { symbol: string; name: string; headline: string; impact: number }
export interface FinalWhistleMessage {
  type: 'final_whistle'; t: number
  lines: FinalWhistleLine[]
}

// --- WebSocket discriminated union ---

export type WsMessage =
  | { type: 'market_tick'; t: number; quotes: Record<string, Quote> }
  | FinalWhistleMessage
  | ({ type: 'tick' } & Tick)
  | { type: 'event'; t: number; symbol: string; kind: MarketEventKind; headline: string; impact: number; storm: number }
  | { type: 'mission'; [key: string]: unknown }
