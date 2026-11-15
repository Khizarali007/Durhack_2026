import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRivals, usePortfolio } from '../api'
import type { RivalRow } from '../api'
import { RivalAvatar, RivalInsights } from '../learning/rivals/RivalBits'
import { formatHOOP, formatPct } from '../utils/format'
import '../components/season.css'

function vsYou(r: RivalRow): string {
  if (r.vs_you === undefined) return 'You'
  if (Math.abs(r.vs_you) < 0.005) return 'Level with you'
  return `${r.vs_you > 0 ? '+' : ''}${r.vs_you.toFixed(2)} pts vs you`
}

/** Friends: you against five practice rivals (computer traders with made-up names, real numbers). */
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
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Friends</h1>
        <span className="quiet-label">
          Practice rivals <span className="separator">/</span> Simulated traders
        </span>
      </header>
      <p className="quiet-label">
        Five practice rivals play the same season as you. They're computer traders from the market with made-up names;
        every number is real.
      </p>
      {error && <p role="alert">{error}</p>}

      <section className="holdings-panel" aria-label="Rivals">
        <div className="panel-heading">
          <h2>
            This season <span className="count-badge">{rows?.length ?? 0}</span>
          </h2>
          <span className="quiet-label">Ranked by season return</span>
        </div>
        {!rows && !error && <p className="empty-holdings">Loading…</p>}
        {rows?.map((r) => {
          const body = (
            <>
              <span className="quiet-label">{r.rank}</span>
              <RivalAvatar name={r.name} />
              <span className="holding-name">
                <strong>{r.name}</strong>
                <small>{r.simulated ? `${r.persona} · Simulated trader` : 'Your account'}</small>
              </span>
              <span className="holding-value">
                <strong className={r.return_pct > 0 ? 'trend-up' : r.return_pct < 0 ? 'trend-down' : ''}>{formatPct(r.return_pct, 2)}</strong>
                <small>
                  {formatHOOP(r.equity)} · {vsYou(r)}
                </small>
              </span>
            </>
          )
          return (
            <div key={r.id}>
              {r.simulated ? (
                <Link to={`/friends/${r.id}`} className="holding-item">
                  {body}
                  <span className="row-arrow" aria-hidden="true">↗</span>
                </Link>
              ) : (
                <div className="holding-item">{body}</div>
              )}
              {r.simulated && <RivalInsights id={r.id} name={r.name} />}
            </div>
          )
        })}
        <div className="panel-foot">
          <span>Return is measured from each trader's start. Rivals' money is scaled to a H$100 start, like yours.</span>
          <Link to="/leaderboard">Leaderboard →</Link>
        </div>
      </section>
    </div>
  )
}
