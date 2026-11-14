import type { WsMessage } from '../api/types'
import { mockMarket } from './mockMarket'
import { mockEvents } from './mockEvents'
import { mockSession } from './mockSession'
import { mockBus, mockControl } from './mockBus'

export class MockWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3
  readyState = 0
  private listeners = new Map<string, Set<EventListener>>()
  private timerId: ReturnType<typeof setInterval> | null = null
  private unsubscribers: Array<() => void> = []

  constructor() {
    queueMicrotask(() => {
      if (this.readyState === 3) return
      this.readyState = 1
      this._emit(new Event('open'))
      this.timerId = setInterval(() => this._tick(), 500)
      // Per-user messages (order fills, receipts, margin calls) and director notices
      this.unsubscribers.push(mockBus.subscribe(msg => this._send(msg)))
      this.unsubscribers.push(mockControl.onDrop(() => this.close()))
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
    if (this.readyState === 3) return
    if (this.timerId !== null) clearInterval(this.timerId)
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
    this.readyState = 3
    this._emit(new Event('close'))
  }

  private _tick(): void {
    if (mockControl.paused) return
    const tick = mockMarket.step()

    this._send({ type: 'market_tick', t: tick.t, quotes: tick.quotes })

    const whistle = mockMarket.getLastWhistle()
    if (whistle) this._send(whistle)

    for (const ev of mockEvents.tick(tick.t)) this._send({ type: 'event', ...ev })

    // Open orders, margin checks and equity samples run on the fresh prices
    mockSession.onTick(tick.t)
  }

  private _send(msg: WsMessage): void {
    this._emit(new MessageEvent('message', { data: JSON.stringify(msg) }))
  }

  private _emit(e: Event): void {
    for (const fn of this.listeners.get(e.type) ?? []) fn(e)
  }
}
