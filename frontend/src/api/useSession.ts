import { useEffect, useSyncExternalStore } from 'react'
import type { SessionOut, MeOut } from './types'
import { ApiError } from './types'
import { getStoredToken, clearStoredToken } from './config'
import { getMe, guestSession, login, signup, logout, upgradeAccount, dismissSeasonReset } from './rest'
import { signalAccountChanged } from './accountSignal'

// One session for the whole app, kept outside React so every hook instance agrees.
// There is no silent guest any more: without a session the shell shows /login.

export interface SessionSnapshot {
  session: SessionOut | null
  me: MeOut | null
  /** True until the stored token has been checked once. */
  loading: boolean
  /** The backend can't be reached right now; the stored token is kept and retried. */
  offline: boolean
}

let snap: SessionSnapshot = { session: null, me: null, loading: true, offline: false }
const listeners = new Set<() => void>()

function set(next: SessionSnapshot): void {
  snap = next
  for (const fn of [...listeners]) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getSessionSnapshot(): SessionSnapshot { return snap }
export function subscribeSession(fn: () => void): () => void { return subscribe(fn) }

const RETRY_MS = 2000
let bootPromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRetry(): void {
  if (retryTimer !== null) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    bootPromise = null
    void bootstrap()
  }, RETRY_MS)
}

/**
 * Restores the stored session. A rejected token (401/403) is dropped and the app shows
 * /login; a backend that is down or restarting keeps the token and quietly retries.
 */
function bootstrap(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const token = getStoredToken()
    if (!token) {
      set({ session: null, me: null, loading: false, offline: false })
      return
    }
    try {
      const me = await getMe()
      set({ session: { token, user_id: me.user_id, cash: me.cash }, me, loading: false, offline: false })
      signalAccountChanged()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearStoredToken()
        set({ session: null, me: null, loading: false, offline: false })
      } else {
        set({ ...snap, loading: false, offline: true })
        scheduleRetry()
      }
    }
  })()
  return bootPromise
}

async function adopt(s: SessionOut): Promise<SessionOut> {
  let me: MeOut
  try {
    me = await getMe()
  } catch {
    me = { user_id: s.user_id, username: s.username ?? null, is_guest: s.is_guest ?? true, cash: s.cash }
  }
  bootPromise = Promise.resolve()
  set({ session: s, me, loading: false, offline: false })
  signalAccountChanged()
  return s
}

/** One click into a funded H$100 (100,000 API accounting units) guest account. */
export async function joinAsGuest(): Promise<SessionOut> {
  return adopt(await guestSession())
}

export async function loginUser(username: string, password: string): Promise<SessionOut> {
  return adopt(await login(username, password))
}

export async function signupUser(username: string, password: string): Promise<SessionOut> {
  return adopt(await signup(username, password))
}

export async function logoutUser(): Promise<void> {
  await logout()
  set({ session: null, me: null, loading: false, offline: false })
  signalAccountChanged()
}

/** Turn the current guest into a named account; the portfolio stays. */
export async function saveProgress(username: string, password: string): Promise<MeOut> {
  const me = await upgradeAccount(username, password)
  set({ ...snap, me })
  return me
}

/** Hide the season-reset notice. */
export async function acknowledgeSeasonReset(): Promise<void> {
  if (snap.me) set({ ...snap, me: { ...snap.me, season_reset: false } })
  try {
    await dismissSeasonReset()
  } catch {
    // The notice is only cosmetic; hiding it locally is enough.
  }
}

/** Check the stored token again now (the "Try now" button while offline). */
export function reconnectSession(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  bootPromise = null
  void bootstrap()
}

/** Kept for older callers; there is no auto-guest any more, so options are ignored. */
export interface UseSessionOptions {
  autoGuest?: boolean
}

export function useSession(_options: UseSessionOptions = {}): SessionSnapshot {
  void _options
  const current = useSyncExternalStore(subscribe, getSessionSnapshot)
  useEffect(() => {
    void bootstrap()
  }, [])
  return current
}

// A token the backend no longer accepts: back to /login (never a silent new guest).
window.addEventListener('session-expired', () => {
  clearStoredToken()
  bootPromise = null
  set({ session: null, me: null, loading: false, offline: false })
  signalAccountChanged()
})
