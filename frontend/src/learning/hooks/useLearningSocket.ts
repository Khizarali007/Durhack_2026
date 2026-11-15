// One hook for the /learning/ws WebSocket, with automatic reconnect.
// Components that use the same URL share a single connection. Malformed
// messages are dropped, so one bad frame never reaches the UI.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { learningWsUrl } from '../../api'
import type { LearningSocketMessage } from '../../api'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

type MessageListener = (msg: LearningSocketMessage) => void
type StatusListener = () => void

const MIN_RETRY_MS = 500
const MAX_RETRY_MS = 5000
const IDLE_CLOSE_MS = 250 // survives React StrictMode's mount / unmount / mount

const pool = new Map<string, SharedSocket>()

function isMessage(value: unknown): value is LearningSocketMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'mission' || type === 'tick'
}

class SharedSocket {
  readonly url: string
  status: SocketStatus = 'connecting'
  private messageListeners = new Set<MessageListener>()
  private statusListeners = new Set<StatusListener>()
  private retries = 0
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private setStatus(status: SocketStatus) {
    this.status = status
    this.statusListeners.forEach((fn) => fn())
  }

  private connect() {
    this.setStatus(this.retries ? 'reconnecting' : 'connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retries = 0
      this.setStatus('open')
    }
    ws.onmessage = (event: MessageEvent) => {
      let msg: unknown
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!isMessage(msg)) return
      this.messageListeners.forEach((fn) => {
        try {
          fn(msg)
        } catch (err) {
          console.error('learning socket listener failed', err)
        }
      })
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      if (!this.disposed) this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    this.setStatus('reconnecting')
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.retries++)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private release() {
    if (this.messageListeners.size || this.statusListeners.size) return
    this.closeTimer = setTimeout(() => this.dispose(), IDLE_CLOSE_MS)
  }

  onMessage(fn: MessageListener): () => void {
    clearTimeout(this.closeTimer)
    this.messageListeners.add(fn)
    return () => {
      this.messageListeners.delete(fn)
      this.release()
    }
  }

  onStatus(fn: StatusListener): () => void {
    clearTimeout(this.closeTimer)
    this.statusListeners.add(fn)
    return () => {
      this.statusListeners.delete(fn)
      this.release()
    }
  }

  private dispose() {
    this.disposed = true
    clearTimeout(this.reconnectTimer)
    pool.delete(this.url)
    const ws = this.ws
    this.ws = null
    ws?.close()
  }
}

function acquire(url: string): SharedSocket {
  let sock = pool.get(url)
  if (!sock) {
    sock = new SharedSocket(url)
    pool.set(url, sock)
  }
  return sock
}

const noop = () => {}

export interface UseLearningSocketOptions {
  apiBase?: string
  userId: string | null | undefined
  /** Extra symbols to stream ticks for when no mission is loaded. */
  symbols?: string[] | null
  onMessage?: (msg: LearningSocketMessage) => void
  enabled?: boolean
}

export interface UseLearningSocketResult {
  status: SocketStatus
  connected: boolean
}

/**
 * Subscribes to /learning/ws. `onMessage` gets every parsed message:
 * `{type: "mission", ...}` or `{type: "tick", ...}`.
 */
export function useLearningSocket({
  apiBase,
  userId,
  symbols,
  onMessage,
  enabled = true,
}: UseLearningSocketOptions): UseLearningSocketResult {
  const handler = useRef(onMessage)
  useEffect(() => {
    handler.current = onMessage
  })

  const symbolsKey = symbols && symbols.length ? symbols.join(',') : ''
  const url = useMemo(
    () => (enabled && userId ? learningWsUrl(apiBase, userId, symbolsKey ? symbolsKey.split(',') : null) : null),
    [apiBase, userId, symbolsKey, enabled],
  )

  useEffect(() => {
    if (!url) return undefined
    return acquire(url).onMessage((msg) => handler.current?.(msg))
  }, [url])

  const subscribe = useCallback((cb: StatusListener) => (url ? acquire(url).onStatus(cb) : noop), [url])
  const getSnapshot = useCallback((): SocketStatus => (url ? (pool.get(url)?.status ?? 'connecting') : 'closed'), [url])
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return { status, connected: status === 'open' }
}
