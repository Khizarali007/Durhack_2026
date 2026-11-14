import type { OrderIn, SessionOut, MeOut, OrderOut, PortfolioOut, CandleData } from '../api/types'
import { PLAYERS } from './players'
import type { Player } from '../api/types'
import { mockSession } from './mockSession'
import { mockMarket } from './mockMarket'
import { mockError } from './errors'

export const mockRest = {
  createSession(): SessionOut { return mockSession.createSession() },
  getMe(): MeOut { return mockSession.getMe() },

  placeOrder(input: OrderIn): OrderOut {
    if (!input.symbol || !input.side || typeof input.qty !== 'number') mockError(422, 'invalid input')
    return mockSession.placeOrder(input)
  },

  getPortfolio(): PortfolioOut { return mockSession.getPortfolio() },
  getPlayers(): Player[] { return PLAYERS },

  getCandles(symbol: string, timeframe: '1m' | '5m' | '1h' | '1d'): CandleData[] {
    return mockMarket.getCandles(symbol, timeframe)
  },
}

// === PLANNED, NOT YET BUILT BY THE TEAM ===
// Confirm with Person 2 (see docs/api-assumptions.md) before integrating.
// signup, login, guestSession, getTrades, getOpenOrders, cancelOrder,
// getOrderQuote, placeLimitOrder, placeStopLoss, placeShort, getLeaderboard,
// getReceipt (mock: 'settling' → 'confirmed' after 600ms with fake Solana URL)
