import type { LeaderboardRow } from '../api/types'
import { mockMarket, SEASON_START_T } from './mockMarket'
import { mockSession } from './mockSession'

// PLANNED: shape guessed, confirm with Person 2 (GET /trading/leaderboard, P2-17).
// Around 20 bot accounts whose equity wanders with market time, plus the signed-in user.

const STARTING_CASH = 100_000

const BOT_NAMES = [
  'MarginCallMe', 'CloudyWithAChance', 'DiamondHandles', 'BuyTheDipper', 'StormChaser',
  'PaperHands42', 'HypeTrainHenry', 'ShortKingSam', 'FairValueFran', 'SpreadEagle',
  'LimitLarry', 'StopLossSteph', 'BenchWarmer', 'SixthManCapital', 'FullCourtPress',
  'AirBallAlpha', 'TripleDoubleTrouble', 'PickAndRoll', 'BuzzerBeaterBets', 'DrizzleDan',
]

interface Bot { username: string; base: number; trend: number; amp: number; period: number; phase: number; verified: boolean }

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const BOTS: Bot[] = BOT_NAMES.map((username, i) => ({
  username,
  base: (hash(i, 1) - 0.42) * 0.16,             // starting return: roughly -7% to +9%
  trend: (hash(i, 2) - 0.5) * 0.02,             // drift per market day
  amp: 0.004 + hash(i, 3) * 0.02,
  period: 1800 + hash(i, 4) * 5400,             // 30 to 120 market minutes
  phase: hash(i, 5) * Math.PI * 2,
  verified: hash(i, 6) < 0.7,
}))

export function mockLeaderboard(): LeaderboardRow[] {
  const elapsed = mockMarket.getMarketTime() - SEASON_START_T
  const rows: Omit<LeaderboardRow, 'rank'>[] = BOTS.map(b => {
    const ret = b.base + b.trend * (elapsed / 86400) + b.amp * Math.sin(elapsed / b.period * Math.PI * 2 + b.phase)
    return {
      username: b.username,
      equity: Math.round(STARTING_CASH * (1 + ret) * 100) / 100,
      return_pct: ret * 100,
      verified: b.verified,
      is_me: false,
    }
  })

  const me = mockSession.getMe()            // throws 401 when signed out
  const portfolio = mockSession.getPortfolio()
  rows.push({
    username: me.username ?? 'Guest',
    equity: Math.round(portfolio.equity * 100) / 100,
    return_pct: portfolio.total_pnl_pct,
    // "Verified" means at least one of this account's trades has a confirmed receipt
    verified: mockSession.hasConfirmedTrade(),
    is_me: true,
  })

  rows.sort((a, b) => b.equity - a.equity)
  return rows.map((r, i) => ({ rank: i + 1, ...r }))
}
