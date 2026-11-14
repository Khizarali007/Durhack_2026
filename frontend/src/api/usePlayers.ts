import { useSyncExternalStore } from 'react'
import type { Player } from './types'
import { getPlayers } from './rest'

// The roster is loaded once and shared: every page needs names and teams by symbol.

interface PlayersSnapshot { players: Player[]; bySymbol: ReadonlyMap<string, Player>; loading: boolean }

let snap: PlayersSnapshot = { players: [], bySymbol: new Map(), loading: true }
const listeners = new Set<() => void>()
let started = false

function load(): void {
  getPlayers()
    .then(players => {
      snap = { players, bySymbol: new Map(players.map(p => [p.symbol, p])), loading: false }
      for (const fn of [...listeners]) fn()
    })
    .catch(() => {
      // Backend not up yet: try again shortly instead of leaving the app empty
      setTimeout(load, 3000)
    })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!started) { started = true; load() }
  return () => { listeners.delete(fn) }
}
function getSnapshot(): PlayersSnapshot { return snap }

export function usePlayers(): PlayersSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot)
}
