// Static data for the component-states gallery. Shapes match the real API.
import { createLearningApi } from '@/api/learning'
import type { MissionEntry, MissionMessage, MissionResult, MissionStatus } from '@/api/learning'
import type { MissionHandle } from '@/components/learning'

const M1: MissionEntry = {
  number: 1,
  id: 'm1_buy_low_sell_high',
  scenario_id: 'm1_buy_low_sell_high',
  status: 'ready',
  title: 'Buy low, sell high',
  goal: 'Buy SGA, then sell it for a profit before the bell.',
  hint: 'Watch the ticker - a player is heating up.',
  grading: { great_min_score: 60 },
  debrief: {},
  lesson: "You only make money when you sell for more than you paid - and hype doesn't last forever.",
  available: true,
}

const LOCKED: [string, string][] = [
  ['m2_read_the_spread', 'Read the spread'],
  ['m3_compose_your_portfolio', 'Compose your portfolio'],
  ['m4_hype_vs_fundamentals', 'Hype vs fundamentals'],
  ['m5_survive_the_storm', 'Survive the storm'],
  ['m6_danger_zone', 'Danger zone'],
]

export const MISSIONS: MissionEntry[] = [
  M1,
  ...LOCKED.map(([id, title], i) => ({
    number: i + 2,
    id,
    scenario_id: null,
    status: 'placeholder',
    title,
    goal: 'TODO',
    hint: 'TODO',
    grading: {},
    debrief: {},
    lesson: 'TODO',
    available: false,
  })),
]

const msg = (seq: number, t: number, kind: MissionMessage['kind'], text: string, extra: Partial<MissionMessage> = {}) => ({
  seq,
  t,
  kind,
  text,
  symbol: null,
  event_kind: null,
  ...extra,
})

const TIMELINE: MissionMessage[] = [
  msg(1, 0, 'state', 'Mission started: Buy low, sell high'),
  msg(2, 0, 'message', 'Opening bell! Clear skies over the court. Prices are calm for now.'),
  msg(3, 3, 'hint', 'Watch the ticker - a player is heating up.'),
  msg(4, 10, 'event', 'SGA heating up: three straight 35-point nights', { symbol: 'SGA', event_kind: 'hot_streak' }),
  msg(5, 18, 'message', 'Forecast: sunshine for SGA. Buyers are piling in.'),
  msg(6, 26, 'hint', 'Hot streaks cool down. A profit only counts once you sell.'),
  msg(7, 35, 'message', 'The hype is drifting off. Ten seconds to the closing bell!'),
  msg(8, 45, 'state', 'Closing bell! Mission complete.'),
]

function status(state: MissionStatus['state'], elapsed: number): MissionStatus {
  const messages = TIMELINE.filter((m) => m.t <= elapsed && (state !== 'running' || m.seq < 8))
  return {
    user_id: 'demo',
    state,
    mission_id: M1.id,
    title: M1.title,
    goal: M1.goal,
    symbols: ['SGA'],
    duration_s: 45,
    elapsed,
    seconds_left: Math.max(0, 45 - elapsed),
    hints: messages.filter((m) => m.kind === 'hint').map((m) => m.text),
    messages: messages.slice(-10),
    result_ready: state !== 'running',
  }
}

const BASE_RESULT: MissionResult = {
  mission_id: M1.id,
  mission_number: 1,
  user_id: 'demo',
  state: 'completed',
  passed: true,
  outcome: 'passed_great',
  score: 93,
  realised_pnl: 776.6,
  return_pct: 16.15,
  qty_bought: 100,
  qty_sold: 100,
  qty_held_at_end: 0,
  entry_price: 48.05,
  exit_price: 55.92,
  best_entry_price: 47.67,
  best_exit_price: 56.16,
  final_equity: 100776.6,
  start_t: 1737313200,
  end_t: 1737313740,
  debrief:
    'Huge! You caught the heater and sold near the top, before the hype cooled. The trading floor is applauding. Take a bow.',
  lesson: M1.lesson,
}

export const RESULTS: Record<string, MissionResult> = {
  passed_great: BASE_RESULT,
  passed_ok: {
    ...BASE_RESULT,
    outcome: 'passed_ok',
    score: 41,
    realised_pnl: 301.2,
    return_pct: 5.9,
    entry_price: 51.02,
    exit_price: 54.11,
    final_equity: 100301.2,
    debrief:
      "Profit in the bag! You bought, you sold, you came out ahead. That's the whole game in one move. Can you catch more of the run next time?",
  },
  sold_at_loss: {
    ...BASE_RESULT,
    state: 'failed',
    passed: false,
    outcome: 'sold_at_loss',
    score: 0,
    realised_pnl: -214.4,
    return_pct: -3.9,
    entry_price: 55.71,
    exit_price: 53.68,
    final_equity: 99785.6,
    debrief:
      "You bought and sold, so you're officially a trader! But you sold for less than you paid. Ouch. Buying after the big run-up, or panic-selling a small dip, are the classic traps.",
  },
  never_bought: {
    ...BASE_RESULT,
    state: 'failed',
    passed: false,
    outcome: 'never_bought',
    score: 0,
    realised_pnl: 0,
    return_pct: null,
    qty_bought: 0,
    qty_sold: 0,
    entry_price: null,
    exit_price: null,
    final_equity: 100000,
    debrief:
      'The bell rang and your cash never left the bench. Safe? Sure. But SGA went on a heater and you watched from the stands. Next time: spot the move, buy in.',
  },
  stopped: {
    ...BASE_RESULT,
    state: 'stopped',
    passed: false,
    outcome: 'still_holding',
    score: 0,
    realised_pnl: 0,
    return_pct: null,
    qty_sold: 0,
    qty_held_at_end: 100,
    exit_price: null,
    final_equity: 100512.3,
    debrief:
      "Nice buy! But you were still holding at the bell. Paper profits are like a forecast: nice to look at, not money yet. Selling is what locks it in.",
  },
}

const noop = () => Promise.resolve()
const api = createLearningApi('http://fixtures.invalid')

export function handle(over: Partial<MissionHandle> = {}): MissionHandle {
  return {
    api,
    userId: 'demo',
    missions: MISSIONS,
    status: null,
    fetchedAt: 0, // 0 = frozen countdown
    result: null,
    passedIds: new Set(),
    error: null,
    busy: false,
    connection: 'open',
    activeEntry: null,
    nextMission: null,
    start: noop,
    stop: noop,
    retry: noop,
    refresh: noop,
    ...over,
  }
}

export const STATES = {
  idle: handle(),
  runningHints: handle({ status: status('running', 6) }),
  hotStreak: handle({ status: status('running', 37) }),
  passed: handle({
    status: status('completed', 45),
    result: RESULTS.passed_great,
    passedIds: new Set([M1.id]),
  }),
  failed: handle({ status: status('failed', 45), result: RESULTS.never_bought }),
  offline: handle({ connection: 'reconnecting', error: 'Failed to fetch' }),
}

export const FEED_SAMPLES: MissionMessage[] = [
  msg(1, 10, 'event', 'SGA heating up: three straight 35-point nights', { symbol: 'SGA', event_kind: 'hot_streak' }),
  msg(2, 14, 'event', 'Clouds gathering over WEMBY: questionable for tonight', { symbol: 'WEMBY', event_kind: 'early_warning' }),
  msg(3, 40, 'event', 'WEMBY ruled out tonight. Storm on the ticker.', { symbol: 'WEMBY', event_kind: 'injury' }),
  msg(4, 20, 'event', 'JOKIC sitting out the back-to-back. Calm skies.', { symbol: 'JOKIC', event_kind: 'rest_day' }),
  msg(5, 25, 'event', 'Whispers: TATUM linked with a blockbuster swap', { symbol: 'TATUM', event_kind: 'trade_rumour' }),
  msg(6, 3, 'hint', 'Watch the ticker - a player is heating up.'),
  msg(7, 18, 'message', 'Forecast: sunshine for SGA. Buyers are piling in.'),
  msg(8, 45, 'state', 'Closing bell! Mission complete.'),
]
