import { useState, useEffect } from 'react'
import type { Quote } from './types'
import { subscribeSymbol, getCachedQuote } from './useMarketStream'

export function useQuote(symbol: string): Quote | null {
  const [quote, setQuote] = useState<Quote | null>(() => getCachedQuote(symbol) ?? null)
  useEffect(() => subscribeSymbol(symbol, setQuote), [symbol])
  return quote
}
