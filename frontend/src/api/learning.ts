// Learning layer (Person 4): REST client and typed models for /learning/*.
// Shapes match docs/person4-interfaces.md. apiBase can be absolute
// ("http://localhost:8001") or relative ("" or "/api") when the backend is
// same-origin or behind a dev proxy.

export const DEFAULT_API_BASE = 'http://localhost:8001'

/* ---- Models ---- */

export type MissionState = 'idle' | 'running' | 'completed' | 'failed' | 'stopped'

export type MissionOutcome =
  | 'never_bought'
  | 'sold_at_loss'
  | 'still_holding'
  | 'passed_ok'
  | 'passed_great'

export type MissionMessageKind = 'hint' | 'message' | 'event' | 'state' | 'result'

export type MarketEventKind = 'early_warning' | 'injury' | 'hot_streak' | 'rest_day' | 'trade_rumour'

/** One entry of GET /learning/missions (content/missions.json + `available`). */
export interface MissionEntry {
  number: number
  id: string
  scenario_id: string | null
  status: 'ready' | 'placeholder' | string
  title: string
  goal: string
  hint: string
  grading: Record<string, number>
  debrief: Partial<Record<MissionOutcome, string>>
  lesson: string
  available: boolean
}

/** A coach / announcer / news line inside a running mission. `t` is real seconds since start. */
export interface MissionMessage {
  seq: number
  t: number
  kind: MissionMessageKind
  text: string
  symbol: string | null
  event_kind: MarketEventKind | string | null
}

/** GET /learning/missions/status, and the body of start / stop. */
export interface MissionStatus {
  user_id: string
  state: MissionState
  mission_id: string | null
  title: string | null
  goal: string | null
  symbols: string[]
  duration_s: number | null
  elapsed: number
  seconds_left: number | null
  hints: string[]
  messages: MissionMessage[]
  result_ready: boolean
}

/** GET /learning/missions/result. */
export interface MissionResult {
  mission_id: string
  mission_number: number
  user_id: string | null
  state: MissionState | null
  passed: boolean
  outcome: MissionOutcome | string
  score: number
  realised_pnl: number
  return_pct: number | null
  qty_bought: number
  qty_sold: number
  qty_held_at_end: number
  entry_price: number | null
  exit_price: number | null
  best_entry_price: number | null
  best_exit_price: number | null
  final_equity: number
  start_t: number
  end_t: number
  debrief: string
  lesson: string
}

export interface GlossaryTerm {
  term: string
  short: string
}

/* ---- WebSocket messages (/learning/ws) ---- */

export interface MissionSnapshotMessage {
  type: 'mission'
  kind: 'snapshot'
  state: MissionState
  text: string | null
  status: MissionStatus
}

export interface MissionLiveMessage extends MissionMessage {
  type: 'mission'
  state: MissionState
  mission_id: string
}

export interface TickMessage {
  type: 'tick'
  t: number
  symbol: string
  price: number
  fair_value: number
  best_bid: number
  best_ask: number
}

export type LearningSocketMessage = MissionSnapshotMessage | MissionLiveMessage | TickMessage

/* ---- Client ---- */

export class LearningApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`)
    this.name = 'LearningApiError'
    this.status = status
    this.detail = detail
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  query?: Record<string, string>
}

function trimBase(apiBase: string | undefined): string {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
}

/** Low-level JSON request against the learning backend. */
export async function learningRequest<T>(
  apiBase: string | undefined,
  path: string,
  { method = 'GET', body, query }: RequestOptions = {},
): Promise<T> {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const res = await fetch(`${trimBase(apiBase)}${path}${qs}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail ?? res.statusText
    throw new LearningApiError(res.status, detail)
  }
  return data as T
}

export function learningWsUrl(apiBase: string | undefined, userId: string, symbols?: string[] | null): string {
  const base = trimBase(apiBase)
  const qs = new URLSearchParams({ user_id: userId })
  if (symbols && symbols.length) qs.set('symbols', symbols.join(','))
  const path = `/learning/ws?${qs}`
  if (/^https?:\/\//i.test(base)) return base.replace(/^http/i, 'ws') + path
  const { protocol, host } = window.location
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${base}${path}`
}

export interface LearningApi {
  base: string
  missions: () => Promise<MissionEntry[]>
  glossary: () => Promise<GlossaryTerm[]>
  start: (userId: string, missionId: string) => Promise<MissionStatus>
  stop: (userId: string) => Promise<MissionStatus>
  status: (userId: string) => Promise<MissionStatus>
  result: (userId: string) => Promise<MissionResult>
  wsUrl: (userId: string, symbols?: string[] | null) => string
}

export function createLearningApi(apiBase: string = DEFAULT_API_BASE): LearningApi {
  const base = trimBase(apiBase)
  return {
    base,
    missions: () => learningRequest(base, '/learning/missions'),
    glossary: () => learningRequest(base, '/learning/glossary'),
    start: (userId, missionId) =>
      learningRequest(base, '/learning/missions/start', {
        method: 'POST',
        body: { user_id: userId, mission_id: missionId },
      }),
    stop: (userId) => learningRequest(base, '/learning/missions/stop', { method: 'POST', body: { user_id: userId } }),
    status: (userId) => learningRequest(base, '/learning/missions/status', { query: { user_id: userId } }),
    result: (userId) => learningRequest(base, '/learning/missions/result', { query: { user_id: userId } }),
    wsUrl: (userId, symbols) => learningWsUrl(base, userId, symbols),
  }
}
