import { useEffect, useState } from 'react'
import { getRivals, useLeaderboard } from '../api'
import type { RivalRow } from '../api'
import { formatHOOP, formatPct } from '../utils/format'
import '../components/season.css'

interface Row {
  key: string
  name: string
  note: string
  returnPct: number
  value: number
  me: boolean
}

/** Everyone in this season, ranked by return, with the practice rivals mixed in (labelled simulated). */
export default function LeaderboardPage() {
  const { rows: people, loading } = useLeaderboard()
  const [rivals, setRivals] = useState<RivalRow[]>([])

  useEffect(() => {
    let alive = true
    getRivals()
      .then((r) => {
        if (alive) setRivals(r.rows.filter((x) => x.simulated))
      })
      .catch(() => {
        /* The leaderboard still works without rivals. */
      })
    return () => {
      alive = false
    }
  }, [people.length])

  const rows: Row[] = [
    ...people.map((p) => ({
      key: `p-${p.rank}-${p.username}`,
      name: p.username,
      note: p.is_me ? 'You' : p.verified ? 'Verified on Solana' : 'Player',
      returnPct: p.return_pct,
      value: p.equity,
      me: p.is_me,
    })),
    ...rivals.map((r) => ({
      key: `r-${r.id}`,
      name: r.name,
      note: `${r.persona} · Simulated trader`,
      returnPct: r.return_pct,
      value: r.equity,
      me: false,
    })),
  ].sort((a, b) => b.returnPct - a.returnPct)

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Leaderboard</h1>
        <span className="quiet-label">
          2024–25 <span className="separator">/</span> Ranked by season return
        </span>
      </header>
      <section className="holdings-panel" aria-label="Leaderboard">
        <div className="panel-heading">
          <h2>
            Traders <span className="count-badge">{rows.length}</span>
          </h2>
          <span className="quiet-label">Players are scored on what they could sell for after costs</span>
        </div>
        {loading && rows.length === 0 && <p className="empty-holdings">Loading…</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="holding-item" aria-current={r.me || undefined}>
            <span className="quiet-label">{i + 1}</span>
            <span className="player-monogram" aria-hidden="true">{r.name.slice(0, 2).toUpperCase()}</span>
            <span className="holding-name">
              <strong>{r.name}</strong>
              <small>{r.note}</small>
            </span>
            <span className="holding-value">
              <strong className={r.returnPct > 0 ? 'trend-up' : r.returnPct < 0 ? 'trend-down' : ''}>{formatPct(r.returnPct, 2)}</strong>
              <small>{formatHOOP(r.value)}</small>
            </span>
          </div>
        ))}
        <div className="panel-foot">
          <span>Everyone shares this replay. Rewinding restarts every portfolio.</span>
        </div>
      </section>
    </div>
  )
}
