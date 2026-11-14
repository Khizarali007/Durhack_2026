import { useState, useEffect } from 'react'
import type { MarketEvent } from './types'
import { subscribeEvents, subscribeTime, getLatestT } from './useMarketStream'

type RadarState = 'calm' | 'cloudy' | 'storm'
interface RadarEntry { state: RadarState; expires_t: number }

const radarEntries = new Map<string, RadarEntry>()
const radarSubs = new Map<string, Set<(state: RadarState) => void>>()

const STORM_DURATION = 1800   // 30 market minutes in seconds
const CLOUD_DURATION = 600    // 10 market minutes in seconds

function notifyRadar(symbol: string, state: RadarState): void {
  for (const cb of radarSubs.get(symbol) ?? []) cb(state)
}

function setRadar(symbol: string, state: RadarState, t: number): void {
  const duration = state === 'storm' ? STORM_DURATION : state === 'cloudy' ? CLOUD_DURATION : 0
  radarEntries.set(symbol, { state, expires_t: t + duration })
  notifyRadar(symbol, state)
}

function getRadarAt(symbol: string, currentT: number): RadarState {
  const entry = radarEntries.get(symbol)
  if (!entry || currentT >= entry.expires_t) return 'calm'
  return entry.state
}

subscribeTime(currentT => {
  for (const [symbol, entry] of radarEntries) {
    if (entry.state !== 'calm' && currentT >= entry.expires_t) {
      radarEntries.set(symbol, { state: 'calm', expires_t: 0 })
      notifyRadar(symbol, 'calm')
    }
  }
})

subscribeEvents((ev: MarketEvent) => {
  let next: RadarState = 'calm'
  if (ev.kind === 'injury') next = 'storm'
  else if (ev.kind === 'early_warning' || ev.kind === 'hot_streak' || ev.kind === 'trade_rumour') next = 'cloudy'
  if (next !== 'calm') setRadar(ev.symbol, next, ev.t)
})

export function useRadar(symbol: string): RadarState {
  const [state, setState] = useState<RadarState>(() => getRadarAt(symbol, getLatestT()))
  useEffect(() => {
    if (!radarSubs.has(symbol)) radarSubs.set(symbol, new Set())
    const cb = (s: RadarState) => setState(s)
    radarSubs.get(symbol)!.add(cb)
    return () => { radarSubs.get(symbol)?.delete(cb) }
  }, [symbol])
  return state
}
