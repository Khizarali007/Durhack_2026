import { useEffect, useState } from 'react'
import { getValuation, subscribeTime } from '../../api'
import type { Valuation } from '../../api'
import { formatHOOP } from '../../utils/format'
import styles from './PlayerForecast.module.css'

const DAY = 86400

/** The analyst model behind the estimate. Reloaded once per market day (it only changes at day close). */
export default function PlayerForecast({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ symbol: string; value: Valuation } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    let day = -1
    const load = () =>
      getValuation(symbol)
        .then((value) => {
          if (alive) {
            setData({ symbol, value })
            setError('')
          }
        })
        .catch(() => {
          if (alive) setError('Forecast temporarily unavailable.')
        })
    void load()
    const unsubscribe = subscribeTime((t) => {
      const today = Math.floor(t / DAY)
      if (day !== -1 && today !== day) void load()
      day = today
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [symbol])

  if (error) return <p className={styles.panel} role="status">{error}</p>
  if (!data || data.symbol !== symbol) return <p className={`${styles.panel} ${styles.muted}`}>Loading performance forecast…</p>

  const v = data.value
  const lastGame =
    v.last_game_score == null
      ? 'No season games revealed yet'
      : `Latest Game Score ${v.last_game_score.toFixed(1)} on ${v.last_game_day}`
  const injury = v.injury_status === 'No report' ? 'Not on the official injury report' : v.injury_reason || v.injury_status

  return (
    <div className={styles.panel} data-tour="stock-forecast">
      <dl className={styles.stats}>
        <div>
          <dt className="label">Expected next payout / share</dt>
          <dd className="num">{formatHOOP(v.next_game_expected_payout, 3)}</dd>
        </div>
        <div>
          <dt className="label">Underlying ability</dt>
          <dd className="num">{v.underlying_ability.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="label">Recent form</dt>
          <dd className="num">{v.recent_form.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="label">Games revealed</dt>
          <dd className="num">{v.games_observed}</dd>
        </div>
      </dl>
      <p className={styles.line}>
        {v.confidence} · {lastGame} · {injury}
      </p>
      <p className={styles.muted}>
        Ability changes slowly; recent form affects near-term payouts more. A model estimate, not a guaranteed payment.
      </p>
    </div>
  )
}
