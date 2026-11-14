import type { WsMessage } from '../api/types'
import { mockMarket } from './mockMarket'
import { mockEvents } from './mockEvents'

export class MockWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3
  readyState = 0
  private listeners = new Map<string, Set<EventListener>>()
  private timerId: ReturnType<typeof setInterval> | null = null

  constructor(_url: string) {
    queueMicrotask(() => {
      this.readyState = 1
      this._emit(new Event('open'))
      this.timerId = setInterval(() => this._tick(), 500)
    })
  }

  addEventListener(type: string, fn: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: EventListener): void {
    this.listeners.get(type)?.delete(fn)
  }

  close(): void {
    if (this.timerId !== null) clearInterval(this.timerId)
    this.readyState = 3
    this._emit(new Event('close'))
  }

  private _tick(): void {
    const tick = mockMarket.step()

    const msg: WsMessage = { type: 'market_tick', t: tick.t, quotes: tick.quotes }
    this._emit(new MessageEvent('message', { data: JSON.stringify(msg) }))

    const whistle = mockMarket.getLastWhistle()
    if (whistle) {
      this._emit(new MessageEvent('message', { data: JSON.stringify(whistle) }))
    }

    const events = mockEvents.tick(tick.t)
    for (const ev of events) {
      this._emit(new MessageEvent('message', { data: JSON.stringify({ type: 'event', ...ev }) }))
    }
  }

  private _emit(e: Event): void {
    for (const fn of this.listeners.get(e.type) ?? []) fn(e)
  }
}
