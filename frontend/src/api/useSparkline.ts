import { useState, useEffect } from 'react'
import { subscribeSparkline, getSparklineBuffer } from './useMarketStream'

export function useSparkline(symbol: string): number[] {
  const [prices, setPrices] = useState<number[]>(() => getSparklineBuffer(symbol))
  useEffect(() => subscribeSparkline(symbol, setPrices), [symbol])
  return prices
}
