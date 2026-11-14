import type { MarketTick, Quote, MakerQuote, FillOut, CandleData, FinalWhistleMessage, FinalWhistleLine } from '../api/types'
import { PLAYERS, PLAYERS_BY_SYMBOL } from './players'
import { mockError } from './errors'

// --- Constants (mirror fake_market.py exactly) ---
const MARKET_SECONDS_PER_TICK = 6.0
const TICKS_PER_MARKET_MINUTE = 10
const TICKS_PER_WHISTLE = 120
const MAKER_STARTING_SHARES = 150
const MAKER_SPREADS = [0.020, 0.025, 0.030]
const MAKER_OFFSETS = [-0.007, 0.0, 0.007]
const INVENTORY_SKEW = 0.15
const FILL_CHUNK = 10
const FAIR_VALUE_VOL = 0.002
const MIN_PRICE = 10.0
const MAKER_IDS = ['MM1', 'MM2', 'MM3']
export const SEASON_START_T = 1729555200  // 2024-10-22 UTC

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

const _rng = mulberry32(42)

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
interface PlayerState {
  symbol: string; fair_value: number; last_price: number
  makers: MakerState[]
  minuteCandles: CandleData[]
  currentCandle: { open: number; high: number; low: number; close: number; time: number } | null
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

function step(): MarketTick {
  _t += MARKET_SECONDS_PER_TICK
  _tickCount++

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

    // Update current minute candle
    if (ps.currentCandle === null) {
      ps.currentCandle = {
        open: ps.last_price, high: ps.last_price,
        low: ps.last_price, close: ps.last_price,
        time: Math.floor(_t),
      }
    } else {
      if (ps.last_price > ps.currentCandle.high) ps.currentCandle.high = ps.last_price
      if (ps.last_price < ps.currentCandle.low) ps.currentCandle.low = ps.last_price
      ps.currentCandle.close = ps.last_price
    }
  }

  // Close minute candle
  if (_tickCount % TICKS_PER_MARKET_MINUTE === 0) {
    for (const ps of playerStates.values()) {
      if (ps.currentCandle) {
        ps.minuteCandles.push({ ...ps.currentCandle })
        if (ps.minuteCandles.length > 500) ps.minuteCandles.shift()
        ps.currentCandle = null
      }
    }
  }

  // Final whistle
  _lastWhistle = null
  if (_tickCount % TICKS_PER_WHISTLE === 0) emitFinalWhistle(_t)

  const quotes: Record<string, Quote> = {}
  for (const ps of playerStates.values()) quotes[ps.symbol] = buildQuote(ps)
  return { t: _t, quotes }
}

function executeChunkInternal(symbol: string, side: 'buy' | 'sell', qty: number): FillOut[] {
  const ps = playerStates.get(symbol)
  if (!ps) return []
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
      fills.push({ trade_id: makeId('t'), qty: chunk, price: bestMaker.ask!, fee, t: _t, counterparty: bestMaker.maker_id })
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
      fills.push({ trade_id: makeId('t'), qty: chunk, price: bestMaker.bid!, fee, t: _t, counterparty: bestMaker.maker_id })
      bestMaker.shares += chunk
      ps.last_price = bestMaker.bid!
      remaining -= chunk
      reQuoteMaker(bestMaker, ps.fair_value)
    }
  }
  return fills
}

function getDailyCandles(symbol: string): CandleData[] {
  const player = PLAYERS_BY_SYMBOL.get(symbol)
  if (!player) return []
  const ps = playerStates.get(symbol)!
  const rng = mulberry32(player.player_id * 7919 + 42)
  const candles: CandleData[] = []
  let price = player.start_price
  const DAY_SECONDS = 86400
  const startTime = SEASON_START_T - 30 * DAY_SECONDS

  for (let i = 0; i < 30; i++) {
    const open = price
    const drift = (rng() - 0.5) * 0.08
    const vol = rng() * 0.03
    const close = Math.max(MIN_PRICE, open * (1 + drift))
    const high = round2(Math.max(open, close) * (1 + vol))
    const low = round2(Math.min(open, close) * (1 - vol))
    price = close
    candles.push({ time: startTime + i * DAY_SECONDS, open: round2(open), high, low, close: round2(close) })
  }

  if (candles.length > 0) {
    const last = candles[candles.length - 1]
    last.close = round2(ps.last_price)
    last.high = round2(Math.max(last.high, last.close))
    last.low = round2(Math.min(last.low, last.close))
    last.isLive = true
  }
  return candles
}

initStates()

export const mockMarket = {
  step(): MarketTick { return step() },

  submitOrder(symbol: string, side: 'buy' | 'sell', qty: number): FillOut[] {
    if (!playerStates.has(symbol)) mockError(404, `unknown symbol '${symbol}'`)
    const fills = executeChunkInternal(symbol, side, qty)
    if (fills.length === 0) mockError(409, 'market makers exhausted')
    return fills
  },

  executeChunk(symbol: string, side: 'buy' | 'sell', qty: number): FillOut[] {
    return executeChunkInternal(symbol, side, qty)
  },

  getQuote(symbol: string): Quote {
    const ps = playerStates.get(symbol)
    if (!ps) mockError(404, `unknown symbol '${symbol}'`)
    return buildQuote(ps)
  },

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

  applyImpact(symbol: string, delta: number): void {
    const ps = playerStates.get(symbol)
    if (!ps) return
    ps.fair_value = Math.max(MIN_PRICE, ps.fair_value * (1 + delta))
    for (const m of ps.makers) reQuoteMaker(m, ps.fair_value)
  },

  getMinuteCandles(symbol: string, limit = 500): CandleData[] {
    const ps = playerStates.get(symbol)
    if (!ps) return []
    const candles = ps.minuteCandles.slice(-limit)
    if (ps.currentCandle) candles.push({ ...ps.currentCandle, isLive: true })
    return candles
  },

  getDailyCandles(symbol: string): CandleData[] { return getDailyCandles(symbol) },

  getCandles(symbol: string, timeframe: '1m' | '5m' | '1h' | '1d'): CandleData[] {
    if (timeframe === '1d') return getDailyCandles(symbol)
    const ps = playerStates.get(symbol)
    if (!ps) return []
    const mins = ps.minuteCandles.slice()
    if (ps.currentCandle) mins.push({ ...ps.currentCandle, isLive: true })
    if (timeframe === '1m') return mins
    const groupSize = timeframe === '5m' ? 5 : 60
    const grouped: CandleData[] = []
    for (let i = 0; i < mins.length; i += groupSize) {
      const g = mins.slice(i, i + groupSize)
      if (g.length === 0) continue
      grouped.push({
        time: g[0].time,
        open: g[0].open,
        high: Math.max(...g.map(c => c.high)),
        low: Math.min(...g.map(c => c.low)),
        close: g[g.length - 1].close,
        isLive: g[g.length - 1].isLive,
      })
    }
    return grouped
  },

  getMarketTime(): number { return _t },

  reset(): void {
    playerStates.clear()
    _t = SEASON_START_T
    _tickCount = 0
    _lastWhistle = null
    _gaussSpare = null
    _idCounter = 0
    initStates()
  },
}
