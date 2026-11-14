import type { WsMessage } from '../api/types'

// Lets the mock ledger and director push messages onto the mock WebSocket,
// the way Person 2's /trading/ws would push fills, receipts and margin calls.

type Listener = (msg: WsMessage) => void
const listeners = new Set<Listener>()
const dropListeners = new Set<() => void>()

export const mockBus = {
  emit(msg: WsMessage): void {
    for (const fn of listeners) fn(msg)
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
}

/** Director-controlled switches the mock WebSocket reads on every tick. */
export const mockControl = {
  paused: false,
  /** Close the mock socket so the reconnect path can be seen. */
  dropConnection(): void {
    for (const fn of [...dropListeners]) fn()
  },
  onDrop(fn: () => void): () => void {
    dropListeners.add(fn)
    return () => { dropListeners.delete(fn) }
  },
}
