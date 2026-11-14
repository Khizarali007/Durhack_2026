// Mission state for one user, kept in sync over REST + the learning WebSocket.
// MissionPanel and MissionDebrief call this themselves, or you call it once
// and pass the returned object to both as `mission` (one fetch stream).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLearningApi } from '../api/learning'
import type { LearningApi, MissionEntry, MissionResult, MissionStatus } from '../api/learning'
import { useLearningSocket } from './useLearningSocket'
import type { SocketStatus } from './useLearningSocket'

const FALLBACK_POLL_MS = 2000
const TICK_MS = 250

export interface UseMissionOptions {
  apiBase?: string
  userId: string | null | undefined
  enabled?: boolean
}

export interface MissionHandle {
  api: LearningApi
  userId: string | null | undefined
  /** The catalogue, in mission order. Locked ones have `available: false`. */
  missions: MissionEntry[]
  status: MissionStatus | null
  /** performance.now() when `status` arrived; 0 means "don't interpolate the countdown". */
  fetchedAt: number
  result: MissionResult | null
  /** Missions passed in this browser session. */
  passedIds: ReadonlySet<string>
  error: string | null
  busy: boolean
  connection: SocketStatus
  activeEntry: MissionEntry | null
  nextMission: MissionEntry | null
  start: (missionId: string) => Promise<void>
  stop: () => Promise<void>
  retry: () => Promise<void>
  refresh: () => Promise<void>
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function useMission({ apiBase, userId, enabled = true }: UseMissionOptions): MissionHandle {
  const api = useMemo(() => createLearningApi(apiBase), [apiBase])
  const [missions, setMissions] = useState<MissionEntry[]>([])
  const [status, setStatus] = useState<MissionStatus | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [result, setResult] = useState<MissionResult | null>(null)
  const [passedIds, setPassedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const applyStatus = useCallback(
    async (st: MissionStatus) => {
      const mine = ++seq.current
      setStatus(st)
      setFetchedAt(performance.now())
      if (st.result_ready && userId) {
        const r = await api.result(userId)
        if (mine !== seq.current) return
        setResult(r)
        if (r.passed) setPassedIds((prev) => new Set(prev).add(r.mission_id))
      } else {
        setResult(null)
      }
    },
    [api, userId],
  )

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return
    try {
      await applyStatus(await api.status(userId))
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }, [api, userId, enabled, applyStatus])

  // Mission catalogue.
  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    api
      .missions()
      .then((m) => {
        if (live) setMissions(m)
      })
      .catch((err: unknown) => {
        if (live) setError(message(err))
      })
    return () => {
      live = false
    }
  }, [api, enabled])

  // Initial status.
  useEffect(() => {
    if (!enabled || !userId) return undefined
    let live = true
    api
      .status(userId)
      .then(async (st) => {
        if (!live) return
        await applyStatus(st)
        setError(null)
      })
      .catch((err: unknown) => {
        if (live) setError(message(err))
      })
    return () => {
      live = false
    }
  }, [api, userId, enabled, applyStatus])

  // Live updates: any mission message means "something changed, refetch".
  const socket = useLearningSocket({
    apiBase,
    userId,
    enabled: enabled && Boolean(userId),
    onMessage: (msg) => {
      if (msg.type !== 'mission') return
      if (msg.kind === 'snapshot' && 'status' in msg) applyStatus(msg.status).catch(() => {})
      else void refresh()
    },
  })

  // Fallback poll while running, in case the socket is down.
  const running = status?.state === 'running'
  useEffect(() => {
    if (!running || socket.connected) return undefined
    const id = setInterval(() => void refresh(), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [running, socket.connected, refresh])

  const run = useCallback(
    async (fn: () => Promise<MissionStatus>) => {
      setBusy(true)
      try {
        await applyStatus(await fn())
        setError(null)
      } catch (err) {
        setError(message(err))
      } finally {
        setBusy(false)
      }
    },
    [applyStatus],
  )

  const start = useCallback(
    (missionId: string) => (userId ? run(() => api.start(userId, missionId)) : Promise.resolve()),
    [run, api, userId],
  )
  const stop = useCallback(() => (userId ? run(() => api.stop(userId)) : Promise.resolve()), [run, api, userId])
  const activeId = status?.mission_id ?? null
  const retry = useCallback(() => (activeId ? start(activeId) : Promise.resolve()), [activeId, start])

  const activeEntry = useMemo(() => missions.find((m) => m.id === activeId) ?? null, [missions, activeId])
  const nextMission = useMemo(() => {
    if (!activeEntry) return missions.find((m) => m.available) ?? null
    return missions.find((m) => m.available && m.number > activeEntry.number) ?? null
  }, [missions, activeEntry])

  return {
    api,
    userId,
    missions,
    status,
    fetchedAt,
    result,
    passedIds,
    error,
    busy,
    connection: socket.status,
    activeEntry,
    nextMission,
    start,
    stop,
    retry,
    refresh,
  }
}

/** Live countdown (seconds, float) interpolated from the last status fetch. */
export function useSecondsLeft(status: MissionStatus | null, fetchedAt: number): number | null {
  const running = status?.state === 'running'
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setNow(performance.now()), TICK_MS)
    return () => clearInterval(id)
  }, [running])
  if (!status || status.seconds_left == null) return null
  if (!running || fetchedAt <= 0) return status.seconds_left
  return Math.max(0, status.seconds_left - Math.max(0, now - fetchedAt) / 1000)
}
