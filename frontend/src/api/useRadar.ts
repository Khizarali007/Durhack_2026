import { useCallback, useSyncExternalStore } from 'react'
import { USE_MOCKS } from './config'
import { useQuote } from './useQuote'
import { getCachedQuote } from './useMarketStream'
import type { MarketEvent } from './types'
import { subscribeEvents, subscribeTime, subscribeMarketReset, getLatestT } from './useMarketStream'

export type RadarState = 'calm' | 'cloudy' | 'storm'
interface RadarEntry { state: RadarState; expires_t: number }
export interface RadarSummary { storm: string[]; cloudy: string[] }

const radarEntries = new Map<string, RadarEntry>()
const radarSubs = new Map<string, Set<() => void>>()
const summaryListeners = new Set<() => void>()
let summary: RadarSummary = { storm: [], cloudy: [] }

const STORM_DURATION = 1800   // 30 market minutes in seconds
const CLOUD_DURATION = 600    // 10 market minutes in seconds

function rebuildSummary(): void {
  const storm: string[] = []
  const cloudy: string[] = []
  for (const [symbol, entry] of radarEntries) {
    if (entry.state === 'storm') storm.push(symbol)
    else if (entry.state === 'cloudy') cloudy.push(symbol)
  }
  summary = { storm, cloudy }
  for (const fn of [...summaryListeners]) fn()
}

function notifyRadar(symbol: string): void {
  for (const cb of radarSubs.get(symbol) ?? []) cb()
}

function setRadar(symbol: string, state: RadarState, t: number): void {
  const duration = state === 'storm' ? STORM_DURATION : state === 'cloudy' ? CLOUD_DURATION : 0
  radarEntries.set(symbol, { state, expires_t: t + duration })
  notifyRadar(symbol)
  rebuildSummary()
}

function getRadarAt(symbol: string, currentT: number): RadarState {
  const entry = radarEntries.get(symbol)
  if (!entry || currentT >= entry.expires_t) return 'calm'
  return entry.state
}

subscribeTime(currentT => {
  let changed = false
  for (const [symbol, entry] of radarEntries) {
    if (currentT >= entry.expires_t) {
      radarEntries.delete(symbol)
      notifyRadar(symbol)
      changed = true
    }
  }
  if (changed) rebuildSummary()
})

subscribeEvents((ev: MarketEvent) => {
  let next: RadarState = 'calm'
  if (ev.kind === 'injury') next = 'storm'
  else if (ev.kind === 'early_warning' || ev.kind === 'hot_streak' || ev.kind === 'trade_rumour') next = 'cloudy'
  if (next === 'calm') return
  // A cloud never downgrades a storm that is still running
  if (next === 'cloudy' && getRadarAt(ev.symbol, ev.t) === 'storm') return
  setRadar(ev.symbol, next, ev.t)
})

subscribeMarketReset(() => {
  const symbols = [...radarEntries.keys()]
  radarEntries.clear()
  for (const symbol of symbols) notifyRadar(symbol)
  rebuildSummary()
})

function injuryRadar(status?:string):RadarState { return status==="Out"||status==="Doubtful"?"storm":status==="Questionable"||status==="Probable"?"cloudy":"calm" }

export function getRadarState(symbol: string): RadarState {
  if(!USE_MOCKS)return injuryRadar(getCachedQuote(symbol)?.injury_status)
  return getRadarAt(symbol, getLatestT())
}

export function useRadar(symbol: string): RadarState {
  const quote=useQuote(symbol)
  const subscribe = useCallback((fn: () => void) => {
    if (!radarSubs.has(symbol)) radarSubs.set(symbol, new Set())
    radarSubs.get(symbol)!.add(fn)
    return () => { radarSubs.get(symbol)?.delete(fn) }
  }, [symbol])
  const getSnapshot = useCallback(() => getRadarAt(symbol, getLatestT()), [symbol])
  const mock = useSyncExternalStore(subscribe, getSnapshot)
  return USE_MOCKS ? mock : injuryRadar(quote?.injury_status)
}

function subscribeSummary(fn: () => void): () => void {
  summaryListeners.add(fn)
  return () => { summaryListeners.delete(fn) }
}
function getSummary(): RadarSummary { return summary }

/** Every stock that is currently stormy or cloudy. */
export function useRadarSummary(): RadarSummary {
  return useSyncExternalStore(subscribeSummary, getSummary)
}
