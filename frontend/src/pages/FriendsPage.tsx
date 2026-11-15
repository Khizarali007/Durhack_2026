import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRivals, usePortfolio } from '../api'
import type { RivalRow } from '../api'
import { RivalAvatar, RivalInsights, SimulatedTag } from '../learning/rivals/RivalBits'
import { formatHOOP, formatPct } from '../utils/format'
import styles from './FriendsPage.module.css'

/** Friends: you vs five simulated practice rivals trading the same season with real engine data. */
export default function FriendsPage() {
  const [rows, setRows] = useState<RivalRow[] | null>(null)
  const [error, setError] = useState('')
  const { portfolio } = usePortfolio()
  const equity = Math.round(portfolio?.equity ?? 0)

  useEffect(() => {
    let alive = true
    getRivals()
      .then((r) => {
        if (alive) {
          setRows(r.rows)
          setError('')
        }
      })
      .catch(() => {
        if (alive) setError('Rivals are unavailable right now.')
      })
    return () => {
      alive = false
    }
  }, [equity])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Friends</h1>
        <p className={styles.lede}>
          Five practice rivals trade the same season as you. They're simulated traders from the market itself, with
          invented names; every number is real.
        </p>
      </header>

      {error && <p className={styles.muted} role="status">{error}</p>}
      {!rows && !error && <div className={`skeleton ${styles.skeleton}`} />}

      {rows && (
        <ol className={styles.list}>
          {rows.map((r) => (
            <li key={r.id} className={`${styles.row} ${r.id === 'you' ? styles.me : ''}`}>
              <div className={styles.main}>
                <span className={`num ${styles.rank}`}>{r.rank}</span>
                <RivalAvatar id={r.id} name={r.name} />
                <div className={styles.who}>
                  {r.id === 'you' ? (
                    <span className={styles.name}>You</span>
                  ) : (
                    <Link to={`/friends/${r.id}`} className={styles.name}>
                      {r.name} <span className={styles.persona}>({r.persona})</span>
                    </Link>
                  )}
                  {r.simulated ? <SimulatedTag /> : <span className={styles.muted}>your account</span>}
                </div>
                <dl className={styles.stats}>
                  <div>
                    <dt className="label">Return</dt>
                    <dd className={`num ${r.return_pct > 0 ? 'trend-up' : r.return_pct < 0 ? 'trend-down' : ''}`}>
                      {formatPct(r.return_pct, 2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Equity</dt>
                    <dd className="num">{formatHOOP(r.equity, 0)}</dd>
                  </div>
                  <div>
                    <dt className="label">Payouts</dt>
                    <dd className="num">{formatHOOP(r.payouts, 0)}</dd>
                  </div>
                  <div>
                    <dt className="label">Grade</dt>
                    <dd>{r.grade ?? '–'}</dd>
                  </div>
                  <div>
                    <dt className="label">Trades</dt>
                    <dd className="num">{r.trades}</dd>
                  </div>
                  <div>
                    <dt className="label">vs you</dt>
                    <dd className={`num ${(r.vs_you ?? 0) > 0 ? 'trend-up' : (r.vs_you ?? 0) < 0 ? 'trend-down' : ''}`}>
                      {r.vs_you === undefined ? '—' : `${r.vs_you > 0 ? '+' : ''}${r.vs_you.toFixed(2)} pts`}
                    </dd>
                  </div>
                </dl>
              </div>
              {r.simulated && <RivalInsights id={r.id} name={r.name} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
