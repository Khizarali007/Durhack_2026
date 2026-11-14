import { useState, useEffect } from 'react'
import type { Quote, MarketEvent, FinalWhistleMessage, WsMessage } from './types'
import { USE_MOCKS, MARKET_WS_PATH } from './config'
import { MockWebSocket } from '../mocks/mockWebSocket'
import { SEASON_START_T } from '../mocks/mockMarket'

type QuoteCb = (quote: Quote) => void
type EventCb = (ev: MarketEvent) => void
type TimeCb = (t: number) => void
type WhistleCb = (msg: FinalWhistleMessage) => void

interface WsLike {
  readyState: number
  addEventListener(type: string, fn: EventListener): void
  removeEventListener(type: string, fn: EventListener): void
  close(): void
}

const symbolSubs = new Map<string, Set<QuoteCb>>()
const eventSubs = new Set<EventCb>()
const timeSubs = new Set<TimeCb>()
const whistleSubs = new Set<WhistleCb>()
const connectionListeners = new Set<() => void>()
const quoteCache = new Map<string, Quote>()
let ws: WsLike | null = null
let _latestT = SEASON_START_T

function connect(): void {
  if (ws !== null) return
  ws = USE_MOCKS ? new MockWebSocket('mock://market') : new WebSocket(MARKET_WS_PATH)

  ws.addEventListener('message', (raw: Event) => {
    const e = raw as MessageEvent
    let msg: unknown
    try { msg = JSON.parse(e.data as string) } catch { return }
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) return
    const m = msg as WsMessage

    if (m.type === 'market_tick') {
      _latestT = m.t
      for (const cb of timeSubs) cb(m.t)
      for (const [symbol, quote] of Object.entries(m.quotes)) {
        quoteCache.set(symbol, quote)
        const subs = symbolSubs.get(symbol)
        if (subs) for (const cb of subs) cb(quote)
      }
    } else if (m.type === 'final_whistle') {
      for (const cb of whistleSubs) cb(m as FinalWhistleMessage)
    } else if (m.type === 'event') {
      const ev = m as unknown as MarketEvent
      for (const cb of eventSubs) cb(ev)
    }
    // 'tick' (Person 4) and 'mission' messages are ignored here
  })

  ws.addEventListener('open', () => { for (const fn of connectionListeners) fn() })
  ws.addEventListener('close', () => {
    ws = null
    for (const fn of connectionListeners) fn()
    setTimeout(connect, 2000)
  })
  ws.addEventListener('error', () => ws?.close())
}

connect()

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

export function getCachedQuote(symbol: string): Quote | undefined { return quoteCache.get(symbol) }
export function getLatestT(): number { return _latestT }

export function useMarketStream(): { connected: boolean } {
  const [connected, setConnected] = useState(() => ws?.readyState === 1)
  useEffect(() => {
    const fn = () => setConnected(ws?.readyState === 1)
    connectionListeners.add(fn)
    return () => { connectionListeners.delete(fn) }
  }, [])
  return { connected }
}
