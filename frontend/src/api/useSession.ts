import { useEffect, useSyncExternalStore } from 'react'
import type { SessionOut, MeOut } from './types'
import { ApiError } from './types'
import { getStoredToken, clearStoredToken } from './config'
import { getMe, guestSession, login, signup, logout } from './rest'
import { signalAccountChanged } from './accountSignal'

// One session for the whole app, kept outside React so every hook instance agrees.

interface SessionSnapshot { session: SessionOut | null; me: MeOut | null; loading: boolean }

let snap: SessionSnapshot = { session: null, me: null, loading: true }
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

let bootPromise: Promise<void> | null = null

/** Restores a stored session if its token still works. Never creates one. */
function bootstrap(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const token = getStoredToken()
    if (token) {
      try {
        const me = await getMe()
        set({ session: { token, user_id: me.user_id, cash: me.cash }, me, loading: false })
        signalAccountChanged()
        return
      } catch (err) {
        // Only a rejected token is thrown away. A backend that is down keeps it for the next visit.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearStoredToken()
      }
    }
    set({ session: null, me: null, loading: false })
  })()
  return bootPromise
}

async function adopt(s: SessionOut): Promise<SessionOut> {
  let me: MeOut
  try { me = await getMe() }
  catch { me = { user_id: s.user_id, username: null, is_guest: true, cash: s.cash } }
  set({ session: s, me, loading: false })
  signalAccountChanged()
  return s
}

/** One click into a funded H$100 (100,000 API accounting units) guest account. */
export async function joinAsGuest(): Promise<SessionOut> { return adopt(await guestSession()) }
export async function loginUser(username: string, password: string): Promise<SessionOut> {
  return adopt(await login(username, password))
}
export async function signupUser(username: string, password: string): Promise<SessionOut> {
  return adopt(await signup(username, password))
}
export async function logoutUser(): Promise<void> {
  await logout()
  set({ session: null, me: null, loading: false })
  signalAccountChanged()
}

let guestPromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
const RETRY_MS = 2000
let guestFailed = false

/** The backend may be restarting: keep trying quietly instead of asking for a page reload. */
function scheduleGuestRetry(): void {
  if (retryTimer !== null) return
  retryTimer = setTimeout(() => { retryTimer = null; ensureGuest() }, RETRY_MS)
}

function ensureGuest(): void {
  if (snap.session !== null || guestPromise) return
  // Show the skeleton on the first try only; retries keep the calm "connecting" message.
  if (!guestFailed) set({ ...snap, loading: true })
  guestPromise = joinAsGuest()
    .then(() => { guestFailed = false })
    .catch(() => { guestFailed = true; set({ session: null, me: null, loading: false }); scheduleGuestRetry() })
    .finally(() => { guestPromise = null })
}

/** Try to get a session now (the shell's Reconnect button). */
export function reconnectSession(): void {
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null }
  ensureGuest()
}

export interface UseSessionOptions {
  /** Create a guest account when nothing is stored. The app shell turns this off and sends people to /join. */
  autoGuest?: boolean
}

export function useSession(options: UseSessionOptions = {}): SessionSnapshot {
  const autoGuest = options.autoGuest ?? true
  const current = useSyncExternalStore(subscribe, getSessionSnapshot)

  useEffect(() => {
    void bootstrap().then(() => { if (autoGuest) ensureGuest() })
  }, [autoGuest])

  return current
}

window.addEventListener('session-expired', () => {
  clearStoredToken()
  bootPromise = null
  set({session:null,me:null,loading:false})
  signalAccountChanged()
  setTimeout(()=>ensureGuest(), 1200)
})
