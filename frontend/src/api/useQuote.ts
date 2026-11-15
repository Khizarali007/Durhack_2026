import { useCallback, useSyncExternalStore } from 'react'
import type { Quote } from './types'
import { subscribeSymbol, getCachedQuote } from './useMarketStream'

/** Latest quote for one stock. Switching symbol shows that symbol's cached quote straight away. */
export function useQuote(symbol: string): Quote | null {
  const subscribe = useCallback((fn: () => void) => subscribeSymbol(symbol, fn), [symbol])
  const getSnapshot = useCallback(() => getCachedQuote(symbol) ?? null, [symbol])
  return useSyncExternalStore(subscribe, getSnapshot)
}
