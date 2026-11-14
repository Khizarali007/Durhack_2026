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

let _rng = mulberry32(137)

const EVENT_PROBABILITY_PER_TICK = 1 / 15

// Headlines stay mild: availability only, never medical, legal or off-court detail.
// Anything speculative ends "(simulated)".
const TEMPLATES: Record<MarketEventKind, (name: string) => string> = {
  early_warning: n => `${n} is a game-time decision tonight (simulated)`,
  injury: n => `${n} ruled out tonight (simulated)`,
  hot_streak: n => `${n} on fire: 30+ in three straight`,
  rest_day: n => `${n} gets a planned rest night`,
  trade_rumour: n => `Buzz: ${n}'s future with the team uncertain (simulated)`,
}

interface PendingInjury { fires_at: number }
const pendingInjuries = new Map<string, PendingInjury>()

// --- Scripted scenarios (offsets in market seconds: 60 = one market minute = 5 real seconds) ---

interface ScenarioStep {
  at: number; kind: MarketEventKind
  /** Fractional fair-value shift, applied as-is. */
  impact: number
  /** Volatility multiplier, carried for the radar. It does not scale the impact. */
  storm: number
  headline: string
}
interface Scenario { symbol: string; steps: ScenarioStep[] }

const SCENARIOS: Record<string, Scenario> = {
  wemby_storm: {
    symbol: 'WEMBY',
    steps: [
      // Early warning: radar goes cloudy, price barely moves
      { at: 0, kind: 'early_warning', impact: -0.01, storm: 1.5,
        headline: 'Victor Wembanyama is a game-time decision tonight (simulated)' },
      // Escalation three market minutes later: enough to trip a tight stop-loss
      { at: 180, kind: 'early_warning', impact: -0.04, storm: 2.5,
        headline: 'Wembanyama not on the floor for warm-ups: status in doubt (simulated)' },
      // Storm at six market minutes: the price gaps down
      { at: 360, kind: 'injury', impact: -0.18, storm: 4.0,
        headline: 'Wembanyama ruled out tonight: Spurs play without him (simulated)' },
    ],
  },
}

interface RunningScenario { scenario: Scenario; start_t: number; next: number }
let running: RunningScenario | null = null

function buildEvent(symbol: string, name: string, kind: MarketEventKind, t: number, impact: number, storm: number): MarketEvent {
  return { t, symbol, kind, headline: TEMPLATES[kind](name), impact, storm }
}

export const mockEvents = {
  tick(t: number): MarketEvent[] {
    const events: MarketEvent[] = []

    // Scripted steps that are now due
    if (running !== null) {
      const { scenario, start_t } = running
      while (running.next < scenario.steps.length && t >= start_t + scenario.steps[running.next].at) {
        const step = scenario.steps[running.next++]
        mockMarket.applyImpact(scenario.symbol, step.impact)
        events.push({ t, symbol: scenario.symbol, kind: step.kind, headline: step.headline, impact: step.impact, storm: step.storm })
      }
      if (running.next >= scenario.steps.length) running = null
    }
    const scripted = running?.scenario.symbol ?? null

    // Fire pending injuries
    for (const [symbol, pending] of pendingInjuries) {
      if (t >= pending.fires_at) {
        pendingInjuries.delete(symbol)
        const player = PLAYERS_BY_SYMBOL.get(symbol)
        if (player && symbol !== scripted) {
          const impact = -(0.1 + _rng() * 0.08)
          mockMarket.applyImpact(symbol, impact)
          events.push(buildEvent(symbol, player.name, 'injury', t, impact, 4.0))
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
      } else if (roll < 0.65) {
        kind = 'rest_day'
        impact = -(0.01 + _rng() * 0.04)
      } else if (roll < 0.80) {
        kind = 'trade_rumour'
        impact = (_rng() - 0.5) * 0.06
        storm = 1.5
      } else {
        kind = 'early_warning'
      }

      // A scripted scenario owns its stock: random news stays off it
      if (player.symbol !== scripted) {
        if (impact !== 0) mockMarket.applyImpact(player.symbol, impact)
        events.push(buildEvent(player.symbol, player.name, kind, t, impact, storm))
      } else {
        pendingInjuries.delete(player.symbol)
      }
    }

    return events
  },

  /** Starts a scripted scenario from the current market time. Returns false if the name is unknown. */
  playScenario(name: string): boolean {
    const scenario = SCENARIOS[name]
    if (!scenario) return false
    pendingInjuries.delete(scenario.symbol)
    running = { scenario, start_t: mockMarket.getMarketTime(), next: 0 }
    return true
  },

  isScenarioRunning(): boolean { return running !== null },

  reset(): void {
    pendingInjuries.clear()
    running = null
    _rng = mulberry32(137)
  },
}
