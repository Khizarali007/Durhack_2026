import { useSyncExternalStore } from 'react'
import type {
  Quote, MarketEvent, FinalWhistleMessage, WsMessage,
  OrderUpdateMessage, MarginCallMessage, Trade,
} from './types'
import { USE_MOCKS, MARKET_WS_PATH } from './config'
import { MockWebSocket } from '../mocks/mockWebSocket'
import { SEASON_START_T } from '../mocks/mockMarket'

type QuoteCb = (quote: Quote) => void
type EventCb = (ev: MarketEvent) => void
type TimeCb = (t: number) => void
type WhistleCb = (msg: FinalWhistleMessage) => void
type SparklineCb = (prices: number[]) => void
type OrderUpdateCb = (msg: OrderUpdateMessage) => void
type ReceiptCb = (trade: Trade) => void
type MarginCallCb = (msg: MarginCallMessage) => void

interface WsLike {
  readyState: number
  addEventListener(type: string, fn: EventListener): void
  removeEventListener(type: string, fn: EventListener): void
  close(): void
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

const RECONNECT_MS = 2000

const symbolSubs = new Map<string, Set<QuoteCb>>()
const eventSubs = new Set<EventCb>()
const timeSubs = new Set<TimeCb>()
const whistleSubs = new Set<WhistleCb>()
const orderUpdateSubs = new Set<OrderUpdateCb>()
const receiptSubs = new Set<ReceiptCb>()
const marginCallSubs = new Set<MarginCallCb>()
const resetSubs = new Set<() => void>()
const connectionListeners = new Set<() => void>()
const quoteCache = new Map<string, Quote>()
const initPriceCache = new Map<string, number>()
const sparklineBuffers = new Map<string, number[]>()
const sparklineSubs = new Map<string, Set<SparklineCb>>()
let ws: WsLike | null = null
let _latestT = SEASON_START_T
let _status: ConnectionStatus = 'connecting'
let _everConnected = false

const SPARKLINE_SIZE = 60

function setStatus(next: ConnectionStatus): void {
  if (_status === next) return
  _status = next
  for (const fn of connectionListeners) fn()
}

/** One bad subscriber must never stop the rest of the tick from being delivered. */
function safely(fn: () => void): void {
  try { fn() } catch (err) { console.error('[market stream] subscriber failed', err) }
}

function handleMarketTick(t: number, quotes: Record<string, Quote>): void {
  if (typeof t !== 'number' || typeof quotes !== 'object' || quotes === null) return
  _latestT = t
  for (const cb of timeSubs) safely(() => cb(t))
  for (const [symbol, quote] of Object.entries(quotes)) {
    if (quote === null || typeof quote !== 'object' || typeof quote.last !== 'number') continue
    quoteCache.set(symbol, quote)

    // Cache first price seen per symbol (used for day-change %)
    if (!initPriceCache.has(symbol)) initPriceCache.set(symbol, quote.last)

    // Sparkline ring buffer
    let buf = sparklineBuffers.get(symbol)
    if (!buf) { buf = []; sparklineBuffers.set(symbol, buf) }
    buf.push(quote.last)
    if (buf.length > SPARKLINE_SIZE) buf.shift()
    const sparkSubs = sparklineSubs.get(symbol)
    if (sparkSubs?.size) {
      const snap = buf.slice()
      for (const cb of sparkSubs) safely(() => cb(snap))
    }

    const subs = symbolSubs.get(symbol)
    if (subs) for (const cb of subs) safely(() => cb(quote))
  }
}

function handleReset(t: number): void {
  _latestT = typeof t === 'number' ? t : SEASON_START_T
  initPriceCache.clear()
  sparklineBuffers.clear()
  for (const fn of resetSubs) safely(fn)
  for (const cb of timeSubs) safely(() => cb(_latestT))
}

function connect(): void {
  if (ws !== null) return
  const socket: WsLike = USE_MOCKS ? new MockWebSocket() : new WebSocket(MARKET_WS_PATH)
  ws = socket

  socket.addEventListener('message', (raw: Event) => {
    const e = raw as MessageEvent
    let msg: unknown
    try { msg = JSON.parse(e.data as string) } catch { return }
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) return
    const m = msg as WsMessage

    switch (m.type) {
      case 'market_tick':
        handleMarketTick(m.t, m.quotes)
        break
      case 'final_whistle':
        if (Array.isArray(m.lines)) for (const cb of whistleSubs) safely(() => cb(m))
        break
      case 'event': {
        if (typeof m.symbol !== 'string' || typeof m.headline !== 'string') break
        const ev: MarketEvent = { t: m.t, symbol: m.symbol, kind: m.kind, headline: m.headline, impact: m.impact, storm: m.storm }
        for (const cb of eventSubs) safely(() => cb(ev))
        break
      }
      // PLANNED: per-user messages, shapes guessed (confirm with Person 2)
      case 'order_update':
        if (m.order && typeof m.order === 'object') for (const cb of orderUpdateSubs) safely(() => cb(m))
        break
      case 'receipt':
        if (m.trade && typeof m.trade === 'object') for (const cb of receiptSubs) safely(() => cb(m.trade))
        break
      case 'margin_call':
        for (const cb of marginCallSubs) safely(() => cb(m))
        break
      case 'market_reset':
        handleReset(m.t)
        break
      default:
        // 'tick' (Person 4) and 'mission' messages are ignored here
        break
    }
  })

  socket.addEventListener('open', () => {
    _everConnected = true
    setStatus('live')
  })
  socket.addEventListener('close', () => {
    if (ws === socket) ws = null
    setStatus(_everConnected ? 'reconnecting' : 'connecting')
    setTimeout(connect, RECONNECT_MS)
  })
  socket.addEventListener('error', () => socket.close())
}

connect()

// If the very first connection never opens, say so rather than sitting on "connecting"
setTimeout(() => { if (_status === 'connecting') setStatus('reconnecting') }, RECONNECT_MS * 2)

export function subscribeSymbol(symbol: string, cb: QuoteCb): () => void {
  if (!symbolSubs.has(symbol)) symbolSubs.set(symbol, new Set())
  symbolSubs.get(symbol)!.add(cb)
  return () => { symbolSubs.get(symbol)?.delete(cb) }
}

export function subscribeEvents(cb: EventCb): () => void {
  eventSubs.add(cb)
  return () => { eventSubs.delete(cb) }
}

export function subscribeTime(cb: TimeCb): () => void {
  timeSubs.add(cb)
  return () => { timeSubs.delete(cb) }
}

export function subscribeWhistle(cb: WhistleCb): () => void {
  whistleSubs.add(cb)
  return () => { whistleSubs.delete(cb) }
}

export function subscribeSparkline(symbol: string, cb: SparklineCb): () => void {
  if (!sparklineSubs.has(symbol)) sparklineSubs.set(symbol, new Set())
  sparklineSubs.get(symbol)!.add(cb)
  return () => { sparklineSubs.get(symbol)?.delete(cb) }
}

// PLANNED: shape guessed, confirm with Person 2
/** A limit or stop order filled, was rejected or was cancelled. */
export function subscribeOrderUpdates(cb: OrderUpdateCb): () => void {
  orderUpdateSubs.add(cb)
  return () => { orderUpdateSubs.delete(cb) }
}

// PLANNED: shape guessed, confirm with Person 2
/** Fires twice per trade: once as 'settling', then as 'confirmed'. */
export function subscribeReceipts(cb: ReceiptCb): () => void {
  receiptSubs.add(cb)
  return () => { receiptSubs.delete(cb) }
}

// PLANNED: shape guessed, confirm with Person 2
/** A leveraged or short position was liquidated. */
export function subscribeMarginCalls(cb: MarginCallCb): () => void {
  marginCallSubs.add(cb)
  return () => { marginCallSubs.delete(cb) }
}

/** Mock only: the director rewound the market, so anything keyed on market time must start over. */
export function subscribeMarketReset(cb: () => void): () => void {
  resetSubs.add(cb)
  return () => { resetSubs.delete(cb) }
}

export function getCachedQuote(symbol: string): Quote | undefined { return quoteCache.get(symbol) }
export function getLatestT(): number { return _latestT }
export function getInitPrice(symbol: string): number | undefined { return initPriceCache.get(symbol) }
export function getSparklineBuffer(symbol: string): number[] { return sparklineBuffers.get(symbol) ?? [] }

function subscribeConnection(fn: () => void): () => void {
  connectionListeners.add(fn)
  return () => { connectionListeners.delete(fn) }
}
function getStatus(): ConnectionStatus { return _status }

export function useMarketStream(): { connected: boolean; status: ConnectionStatus } {
  const status = useSyncExternalStore(subscribeConnection, getStatus)
  return { connected: status === 'live', status }
}
