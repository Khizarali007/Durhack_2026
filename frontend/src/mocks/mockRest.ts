import type {
  OrderIn, SessionOut, MeOut, OrderOut, PortfolioOut, CandleData, Player, Timeframe,
  OrderSide, OrderQuote, OpenOrderIn, OpenOrder, Trade, LeaderboardRow, MarginOrderIn, EquityPoint,
} from '../api/types'
import { PLAYERS } from './players'
import { mockSession } from './mockSession'
import { mockMarket } from './mockMarket'
import { mockLeaderboard } from './mockLeaderboard'

export const mockRest = {
  // --- Built by the team (shapes confirmed) ---
  createSession(): SessionOut { return mockSession.createSession() },
  getMe(): MeOut { return mockSession.getMe() },
  placeOrder(input: OrderIn): OrderOut { return mockSession.placeOrder(input) },
  getPortfolio(): PortfolioOut { return mockSession.getPortfolio() },
  getPlayers(): Player[] { return PLAYERS },
  getCandles(symbol: string, timeframe: Timeframe): CandleData[] {
    return mockMarket.getCandles(symbol, timeframe)
  },

  // --- PLANNED, NOT YET BUILT BY THE TEAM ---
  // Shapes guessed. Confirm with Person 2 (see docs/api-assumptions.md) before integrating.
  getOrderQuote(symbol: string, side: OrderSide, qty: number, leverage: number): OrderQuote {
    return mockSession.getOrderQuote(symbol, side, qty, leverage)
  },
  placeOpenOrder(input: OpenOrderIn): OpenOrder { return mockSession.placeOpenOrder(input) },
  getOpenOrders(): OpenOrder[] { return mockSession.getOpenOrders() },
  cancelOrder(orderId: string): OpenOrder { return mockSession.cancelOrder(orderId) },
  getTrades(): Trade[] { return mockSession.getTrades() },
  signup(username: string, password: string): SessionOut { return mockSession.signup(username, password) },
  login(username: string, password: string): SessionOut { return mockSession.login(username, password) },
  logout(): void { mockSession.logout() },
  getLeaderboard(): LeaderboardRow[] { return mockLeaderboard() },
  placeMarginOrder(input: MarginOrderIn): OrderOut { return mockSession.placeOrder(input) },
  getEquityHistory(): EquityPoint[] { return mockSession.getEquityHistory() },
}
