import type {
  MarketTick, Quote, MakerQuote, FillOut, CandleData, Timeframe,
  FinalWhistleMessage, FinalWhistleLine,
} from '../api/types'
import { TIMEFRAME_SECONDS } from '../api/orderMath'
import { PLAYERS, PLAYERS_BY_SYMBOL } from './players'
import { mockError } from './errors'

// --- Constants (mirror fake_market.py exactly) ---
const MARKET_SECONDS_PER_TICK = 6.0
const TICKS_PER_WHISTLE = 120
const MAKER_STARTING_SHARES = 150
const MAKER_SPREADS = [0.020, 0.025, 0.030]
const MAKER_OFFSETS = [-0.007, 0.0, 0.007]
const INVENTORY_SKEW = 0.15
export const FILL_CHUNK = 10
const FAIR_VALUE_VOL = 0.002
const MIN_PRICE = 10.0
const MAKER_IDS = ['MM1', 'MM2', 'MM3']
export const SEASON_START_T = 1729555200  // 2024-10-22 UTC

// --- Month-1 history (mock only: the real candles come from Person 1) ---
const HISTORY_DAYS = 30
const HISTORY_MINUTES = HISTORY_DAYS * 1440
const HISTORY_VOL_PER_MINUTE = 0.0014
const HISTORY_BOUNCE = 0.045          // bid/ask bounce, like the live tape
const LIVE_MINUTE_CAP = 1500
/** How many history candles each timeframe returns. */
const HISTORY_BUCKETS: Record<Timeframe, number> = { '1m': 480, '5m': 864, '1h': 720, '1d': 30 }

// --- PRNG ---
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let _rng = mulberry32(42)

// Box-Muller gaussian
let _gaussSpare: number | null = null
function gaussRng(): number {
  if (_gaussSpare !== null) { const v = _gaussSpare; _gaussSpare = null; return v }
  let u: number, v: number, s: number
  do {
    u = _rng() * 2 - 1
    v = _rng() * 2 - 1
    s = u * u + v * v
  } while (s >= 1 || s === 0)
  const mul = Math.sqrt(-2 * Math.log(s) / s)
  _gaussSpare = v * mul
  return u * mul
}

function round2(x: number): number { return Math.round(x * 100) / 100 }

/** 0.10% of notional, rounded half-up to the cent (matches orders.py). */
function feeCents(notionalCents: number): number {
  return Math.floor((Math.round(notionalCents) + 500) / 1000)
}

let _idCounter = 0
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`
}

// --- Internal state ---
interface MakerState {
  maker_id: string; shares: number
  bid: number | null; ask: number | null
  spread_pct: number; offset: number
}
interface LiveCandle { open: number; high: number; low: number; close: number; time: number }
interface PlayerState {
  symbol: string; fair_value: number; last_price: number
  makers: MakerState[]
  minuteCandles: CandleData[]
  currentCandle: LiveCandle | null
}

/** What the ledger needs to fill (or dry-run) an order against one stock. */
export interface MarketEngine {
  getQuote(): Quote
  executeChunk(side: 'buy' | 'sell', qty: number): FillOut[]
}

const playerStates = new Map<string, PlayerState>()
let _t = SEASON_START_T
let _tickCount = 0
let _lastWhistle: FinalWhistleMessage | null = null

function reQuoteMaker(m: MakerState, fairValue: number): void {
  const skew = INVENTORY_SKEW * (MAKER_STARTING_SHARES - m.shares) / MAKER_STARTING_SHARES
  const mid = fairValue * Math.max(0.5, 1 + skew + m.offset)
  const half = mid * m.spread_pct / 2
  m.bid = round2(mid - half)
  m.ask = m.shares > 0 ? round2(mid + half) : null
}

function bestBid(ps: PlayerState): number | null {
  let best: number | null = null
  for (const m of ps.makers) {
    if (m.bid !== null && (best === null || m.bid > best)) best = m.bid
  }
  return best
}

function bestAsk(ps: PlayerState): number | null {
  let best: number | null = null
  for (const m of ps.makers) {
    if (m.ask !== null && (best === null || m.ask < best)) best = m.ask
  }
  return best
}

function buildMakerQuotes(ps: PlayerState): MakerQuote[] {
  return ps.makers.map(m => ({ maker_id: m.maker_id, bid: m.bid, ask: m.ask, shares: m.shares }))
}

function buildQuote(ps: PlayerState): Quote {
  return {
    symbol: ps.symbol,
    bid: bestBid(ps),
    ask: bestAsk(ps),
    last: ps.last_price,
    fair_value: ps.fair_value,
    makers: buildMakerQuotes(ps),
  }
}

function initStates(): void {
  for (const p of PLAYERS) {
    const fv = p.start_price
    const makers: MakerState[] = MAKER_IDS.map((id, i) => ({
      maker_id: id,
      shares: MAKER_STARTING_SHARES,
      bid: null, ask: null,
      spread_pct: MAKER_SPREADS[i],
      offset: MAKER_OFFSETS[i],
    }))
    for (const m of makers) reQuoteMaker(m, fv)
    const initPrice = (() => {
      let ask: number | null = null
      for (const m of makers) if (m.ask !== null && (ask === null || m.ask < ask)) ask = m.ask
      return ask ?? fv
    })()
    playerStates.set(p.symbol, {
      symbol: p.symbol, fair_value: fv, last_price: initPrice,
      makers, minuteCandles: [], currentCandle: null,
    })
  }
}

function emitFinalWhistle(t: number): void {
  const impacts: { symbol: string; name: string; impact: number; pts: number; ast: number; reb: number }[] = []
  for (const p of PLAYERS) {
    const pts = Math.max(0, Math.round(gaussRng() * 7 + 18))
    const ast = Math.max(0, Math.round(Math.abs(gaussRng() * 3) + 4))
    const reb = Math.max(0, Math.round(Math.abs(gaussRng() * 3) + 5))
    const impact = gaussRng() * 0.03
    const ps = playerStates.get(p.symbol)!
    ps.fair_value = Math.max(MIN_PRICE, ps.fair_value * (1 + impact))
    for (const m of ps.makers) reQuoteMaker(m, ps.fair_value)
    impacts.push({ symbol: p.symbol, name: p.name, impact, pts, ast, reb })
  }
  const lines: FinalWhistleLine[] = impacts
    .filter(i => Math.abs(i.impact) > 0.03)
    .map(i => ({
      symbol: i.symbol, name: i.name,
      headline: `${i.name} ${i.pts} pts, ${i.ast} ast, ${i.reb} reb`,
      impact: i.impact,
    }))
  _lastWhistle = { type: 'final_whistle', t, lines }
}

/** Live candles sit on whole market minutes, so every timeframe buckets cleanly. */
function trackCandle(ps: PlayerState, bucket: number): void {
  const cur = ps.currentCandle
  if (cur !== null && cur.time !== bucket) {
    ps.minuteCandles.push({ ...cur })
    if (ps.minuteCandles.length > LIVE_MINUTE_CAP) ps.minuteCandles.shift()
    ps.currentCandle = null
  }
  if (ps.currentCandle === null) {
    // Open at the previous close so candles join up
    const open = cur !== null ? cur.close : ps.last_price
    ps.currentCandle = {
      open,
      high: Math.max(open, ps.last_price),
      low: Math.min(open, ps.last_price),
      close: ps.last_price,
      time: bucket,
    }
    return
  }
  const live = ps.currentCandle
  if (ps.last_price > live.high) live.high = ps.last_price
  if (ps.last_price < live.low) live.low = ps.last_price
  live.close = ps.last_price
}

function step(): MarketTick {
  _t += MARKET_SECONDS_PER_TICK
  _tickCount++
  const bucket = Math.floor(_t / 60) * 60

  for (const ps of playerStates.values()) {
    ps.fair_value = Math.max(MIN_PRICE, ps.fair_value * Math.exp(gaussRng() * FAIR_VALUE_VOL))
    for (const m of ps.makers) reQuoteMaker(m, ps.fair_value)

    // Bot trades (3 per tick)
    for (let i = 0; i < 3; i++) {
      const side = _rng() < 0.5 ? 'buy' : 'sell'
      const maker = ps.makers[Math.floor(_rng() * ps.makers.length)]
      if (side === 'buy' && maker.ask !== null && maker.shares > 0) {
        maker.shares -= 1
        ps.last_price = maker.ask
        reQuoteMaker(maker, ps.fair_value)
      } else if (side === 'sell' && maker.bid !== null) {
        maker.shares += 1
        ps.last_price = maker.bid
        reQuoteMaker(maker, ps.fair_value)
      }
    }

    trackCandle(ps, bucket)
  }

  // Final whistle
  _lastWhistle = null
  if (_tickCount % TICKS_PER_WHISTLE === 0) emitFinalWhistle(_t)

  const quotes: Record<string, Quote> = {}
  for (const ps of playerStates.values()) quotes[ps.symbol] = buildQuote(ps)
  return { t: _t, quotes }
}

/** Fills up to `qty` against the best maker each time, in FILL_CHUNK slices. */
function executeOn(ps: PlayerState, side: 'buy' | 'sell', qty: number, dryRun: boolean): FillOut[] {
  const fills: FillOut[] = []
  let remaining = qty

  while (remaining > 0) {
    if (side === 'buy') {
      let bestMaker: MakerState | null = null
      for (const m of ps.makers) {
        if (m.ask !== null && m.shares > 0 && (bestMaker === null || m.ask < bestMaker.ask!)) bestMaker = m
      }
      if (bestMaker === null) break
      const chunk = Math.min(remaining, FILL_CHUNK, bestMaker.shares)
      if (chunk <= 0) break
      const notional = bestMaker.ask! * chunk
      const fee = feeCents(notional * 100) / 100
      fills.push({
        trade_id: dryRun ? 'estimate' : makeId('t'), qty: chunk, price: bestMaker.ask!, fee,
        t: _t, counterparty: bestMaker.maker_id,
      })
      bestMaker.shares -= chunk
      ps.last_price = bestMaker.ask!
      remaining -= chunk
      reQuoteMaker(bestMaker, ps.fair_value)
    } else {
      let bestMaker: MakerState | null = null
      for (const m of ps.makers) {
        if (m.bid !== null && (bestMaker === null || m.bid > bestMaker.bid!)) bestMaker = m
      }
      if (bestMaker === null) break
      const chunk = Math.min(remaining, FILL_CHUNK)
      const notional = bestMaker.bid! * chunk
      const fee = feeCents(notional * 100) / 100
      fills.push({
        trade_id: dryRun ? 'estimate' : makeId('t'), qty: chunk, price: bestMaker.bid!, fee,
        t: _t, counterparty: bestMaker.maker_id,
      })
      bestMaker.shares += chunk
      ps.last_price = bestMaker.bid!
      remaining -= chunk
      reQuoteMaker(bestMaker, ps.fair_value)
    }
  }
  return fills
}

function engineFor(ps: PlayerState, dryRun: boolean): MarketEngine {
  return {
    getQuote: () => buildQuote(ps),
    executeChunk: (side, qty) => executeOn(ps, side, qty, dryRun),
  }
}

// --- History ---

const historyCache = new Map<string, Float32Array>()

/** One close per market minute for the 30 days before the season start, ending at the start price. */
function historyCloses(symbol: string): Float32Array | null {
  const cached = historyCache.get(symbol)
  if (cached) return cached
  const player = PLAYERS_BY_SYMBOL.get(symbol)
  if (!player) return null

  const rng = mulberry32(player.player_id * 7919 + 42)
  const closes = new Float32Array(HISTORY_MINUTES)
  let fv = player.start_price
  // Walk backwards from the start price so history joins the live tape
  for (let k = HISTORY_MINUTES - 1; k >= 0; k--) {
    closes[k] = Math.max(MIN_PRICE, fv * (1 + (rng() - 0.5) * HISTORY_BOUNCE))
    const z = (rng() + rng() + rng() + rng() - 2) * 1.7320508
    fv = Math.max(MIN_PRICE, fv / Math.exp(z * HISTORY_VOL_PER_MINUTE))
  }
  historyCache.set(symbol, closes)
  return closes
}

function historyCandles(symbol: string, timeframe: Timeframe): CandleData[] {
  const closes = historyCloses(symbol)
  if (!closes) return []
  const perBucket = TIMEFRAME_SECONDS[timeframe] / 60
  const totalBuckets = HISTORY_MINUTES / perBucket
  const firstBucket = totalBuckets - Math.min(HISTORY_BUCKETS[timeframe], totalBuckets)
  const t0 = SEASON_START_T - HISTORY_MINUTES * 60
  const out: CandleData[] = []

  for (let b = firstBucket; b < totalBuckets; b++) {
    const i0 = b * perBucket
    const i1 = i0 + perBucket - 1
    const open = i0 > 0 ? closes[i0 - 1] : closes[i0]
    let high = open
    let low = open
    for (let i = i0; i <= i1; i++) {
      if (closes[i] > high) high = closes[i]
      if (closes[i] < low) low = closes[i]
    }
    // Small deterministic wick so one-minute candles are not bare bodies
    const wick = (((b * 2654435761) >>> 0) / 4294967296) * 0.004
    out.push({
      time: t0 + i0 * 60,
      open: round2(open),
      high: round2(high * (1 + wick)),
      low: round2(low * (1 - wick * 0.8)),
      close: round2(closes[i1]),
    })
  }
  return out
}

function liveCandles(ps: PlayerState, timeframe: Timeframe): CandleData[] {
  const mins: CandleData[] = ps.minuteCandles.slice()
  if (ps.currentCandle) mins.push({ ...ps.currentCandle })
  if (timeframe === '1m') return mins

  const size = TIMEFRAME_SECONDS[timeframe]
  const grouped: CandleData[] = []
  for (const c of mins) {
    const bucket = Math.floor(c.time / size) * size
    const last = grouped[grouped.length - 1]
    if (last && last.time === bucket) {
      if (c.high > last.high) last.high = c.high
      if (c.low < last.low) last.low = c.low
      last.close = c.close
    } else {
      grouped.push({ time: bucket, open: c.open, high: c.high, low: c.low, close: c.close })
    }
  }
  return grouped
}

initStates()

export const mockMarket = {
  step(): MarketTick { return step() },

  /** The live book for one stock. Throws 404 for an unknown symbol. */
  engine(symbol: string): MarketEngine {
    const ps = playerStates.get(symbol)
    if (!ps) mockError(404, `unknown symbol '${symbol}'`)
    return engineFor(ps, false)
  },

  /** A throwaway copy of the book, for estimating an order without trading. */
  simulator(symbol: string): MarketEngine {
    const ps = playerStates.get(symbol)
    if (!ps) mockError(404, `unknown symbol '${symbol}'`)
    const clone: PlayerState = {
      ...ps,
      makers: ps.makers.map(m => ({ ...m })),
      minuteCandles: [],
      currentCandle: null,
    }
    return engineFor(clone, true)
  },

  getQuote(symbol: string): Quote {
    const ps = playerStates.get(symbol)
    if (!ps) mockError(404, `unknown symbol '${symbol}'`)
    return buildQuote(ps)
  },

  hasSymbol(symbol: string): boolean { return playerStates.has(symbol) },

  getMarketTick(): MarketTick {
    const quotes: Record<string, Quote> = {}
    for (const ps of playerStates.values()) quotes[ps.symbol] = buildQuote(ps)
    return { t: _t, quotes }
  },

  getLastWhistle(): FinalWhistleMessage | null {
    const w = _lastWhistle
    _lastWhistle = null
    return w
  },

  /** Shift fair value by a fraction: -0.18 means fair value drops 18%. */
  applyImpact(symbol: string, delta: number): void {
    const ps = playerStates.get(symbol)
    if (!ps) return
    ps.fair_value = Math.max(MIN_PRICE, ps.fair_value * (1 + delta))
    for (const m of ps.makers) reQuoteMaker(m, ps.fair_value)
  },

  /** Month-1 history followed by the live candles. The last candle is always the live one. */
  getCandles(symbol: string, timeframe: Timeframe): CandleData[] {
    const ps = playerStates.get(symbol)
    if (!ps) return []
    const candles = [...historyCandles(symbol, timeframe), ...liveCandles(ps, timeframe)]
    if (candles.length > 0) candles[candles.length - 1].isLive = true
    return candles
  },

  getMarketTime(): number { return _t },

  reset(): void {
    playerStates.clear()
    _t = SEASON_START_T
    _tickCount = 0
    _lastWhistle = null
    _gaussSpare = null
    _idCounter = 0
    _rng = mulberry32(42)
    initStates()
  },
}
