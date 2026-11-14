import { useState, useEffect } from 'react'
import type { PortfolioOut } from './types'
import { getPortfolio } from './rest'

export function usePortfolio(): { portfolio: PortfolioOut | null; loading: boolean } {
  const [portfolio, setPortfolio] = useState<PortfolioOut | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPortfolio()
      .then(p => { setPortfolio(p); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return { portfolio, loading }
}
