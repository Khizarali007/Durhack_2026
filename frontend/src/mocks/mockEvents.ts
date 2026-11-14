import type { MarketEvent, MarketEventKind } from '../api/types'
import { PLAYERS, PLAYERS_BY_SYMBOL } from './players'
import { mockMarket } from './mockMarket'

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const _rng = mulberry32(137)

const EVENT_PROBABILITY_PER_TICK = 1 / 15

const TEMPLATES: Record<MarketEventKind, (name: string) => string> = {
  early_warning: n => `${n} listed questionable tonight`,
  injury: n => `${n} leaves the game, questionable to return`,
  hot_streak: n => `${n} on fire: 30+ in three straight`,
  rest_day: n => `${n} gets a planned rest night`,
  trade_rumour: n => `Buzz: ${n}'s future with the team uncertain (simulated)`,
}

interface PendingInjury { fires_at: number }
const pendingInjuries = new Map<string, PendingInjury>()

function buildEvent(symbol: string, name: string, kind: MarketEventKind, t: number, impact: number, storm: number): MarketEvent {
  return { t, symbol, kind, headline: TEMPLATES[kind](name), impact, storm }
}

export const mockEvents = {
  tick(t: number): MarketEvent[] {
    const events: MarketEvent[] = []

    // Fire pending injuries
    for (const [symbol, pending] of pendingInjuries) {
      if (t >= pending.fires_at) {
        pendingInjuries.delete(symbol)
        const player = PLAYERS_BY_SYMBOL.get(symbol)
        if (player) {
          const impact = -(0.1 + _rng() * 0.08)
          const storm = 4.0
          mockMarket.applyImpact(symbol, impact * storm)
          events.push(buildEvent(symbol, player.name, 'injury', t, impact, storm))
        }
      }
    }

    // Random event
    if (_rng() < EVENT_PROBABILITY_PER_TICK) {
      const player = PLAYERS[Math.floor(_rng() * PLAYERS.length)]
      const roll = _rng()
      let kind: MarketEventKind
      let impact = 0
      let storm = 1.0

      if (roll < 0.20) {
        kind = 'early_warning'
        storm = 1.5
        pendingInjuries.set(player.symbol, { fires_at: t + (3 + _rng() * 3) * 60 })
      } else if (roll < 0.50) {
        kind = 'hot_streak'
        impact = 0.02 + _rng() * 0.06
        mockMarket.applyImpact(player.symbol, impact * storm)
      } else if (roll < 0.65) {
        kind = 'rest_day'
        impact = -(0.01 + _rng() * 0.04)
        mockMarket.applyImpact(player.symbol, impact * storm)
      } else if (roll < 0.80) {
        kind = 'trade_rumour'
        impact = (_rng() - 0.5) * 0.06
        storm = 1.5
        mockMarket.applyImpact(player.symbol, impact * storm)
      } else {
        kind = 'early_warning'
      }

      events.push(buildEvent(player.symbol, player.name, kind, t, impact, storm))
    }

    return events
  },

  triggerEvent(symbol: string, kind: MarketEventKind): void {
    const player = PLAYERS_BY_SYMBOL.get(symbol)
    if (!player) return
    const t = mockMarket.getMarketTime()
    if (kind === 'injury') {
      pendingInjuries.set(symbol, { fires_at: t + 3 * 60 })
    } else {
      const impact = kind === 'hot_streak' ? 0.05 : kind === 'rest_day' ? -0.03 : 0
      mockMarket.applyImpact(symbol, impact)
    }
  },

  playScenario(name: string): void {
    console.warn(`[mockEvents] STUB: scenario '${name}' not yet implemented.`)
    // 'wemby_storm': t+0 early_warning(impact=0, storm=1.5)
    //                t+180 market-s: early_warning(impact=-0.02, storm=2.5)
    //                t+360 market-s: injury(impact=-0.18, storm=4.0)
  },
}
