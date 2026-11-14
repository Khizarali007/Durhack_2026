// MOCK ONLY: talks to /learning/mock/* on the dev backend, standing in for
// Person 2's trading API. Sandbox only, never part of the product.
import { learningRequest } from '@/api/learning'

export interface Position {
  symbol: string
  qty: number
  avg_cost: number
}

export interface Portfolio {
  cash: number
  equity: number
  positions: Position[]
}

export interface Fill {
  trade_id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  fee: number
}

export function mockPortfolio(apiBase: string, userId: string): Promise<Portfolio> {
  return learningRequest(apiBase, '/learning/mock/portfolio', { query: { user_id: userId } })
}

export function mockOrder(apiBase: string, userId: string, symbol: string, side: 'buy' | 'sell', qty: number): Promise<Fill> {
  return learningRequest(apiBase, '/learning/mock/order', {
    method: 'POST',
    body: { user_id: userId, symbol, side, qty },
  })
}
