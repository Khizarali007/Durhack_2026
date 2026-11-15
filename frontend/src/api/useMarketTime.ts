import { useState, useEffect } from 'react'
import { subscribeTime, getLatestT } from './useMarketStream'

export function useMarketTime(): number {
  const [t, setT] = useState(getLatestT)
  useEffect(() => subscribeTime(setT), [])
  return t
}
