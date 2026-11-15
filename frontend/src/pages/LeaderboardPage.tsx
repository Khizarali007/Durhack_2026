import { useEffect, useState } from 'react'
import { getRivals, useLeaderboard } from '../api'
import type { RivalRow } from '../api'
import { Pill } from '../components/ui'
import { formatHOOP, formatPct } from '../utils/format'
import styles from './LeaderboardPage.module.css'

interface Row {
  key: string
  name: string
  returnPct: number
  value: number
  simulated: boolean
  me: boolean
  verified: boolean
}

/** Everyone in this season, ranked by return, with the practice rivals mixed in (flagged as simulated). */
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
        // The leaderboard still works without rivals.
      })
    return () => {
      alive = false
    }
  }, [people.length])

  const rows: Row[] = [
    ...people.map((p) => ({
      key: `p-${p.rank}-${p.username}`,
      name: p.username,
      returnPct: p.return_pct,
      value: p.equity,
      simulated: false,
      me: p.is_me,
      verified: p.verified,
    })),
    ...rivals.map((r) => ({
      key: `r-${r.id}`,
      name: `${r.name} (${r.persona})`,
      returnPct: r.return_pct,
      value: r.equity,
      simulated: true,
      me: false,
      verified: false,
    })),
  ].sort((a, b) => b.returnPct - a.returnPct)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Season leaderboard</h1>
        <p className={styles.lede}>
          Ranked by season return. People are scored on what they could sell for after fees; simulated rivals on their
          marked equity. Everyone shares this replay, and rewinding restarts every portfolio.
        </p>
      </header>

      {loading && rows.length === 0 ? (
        <div className={`skeleton ${styles.skeleton}`} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.right}>Rank</th>
              <th>Trader</th>
              <th className={styles.right}>Return</th>
              <th className={styles.right}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={r.me ? styles.me : undefined}>
                <td className={`num ${styles.right}`}>{i + 1}</td>
                <td>
                  <span className={styles.name}>{r.name}</span>
                  {r.me && <Pill variant="accent">You</Pill>}
                  {r.simulated && <Pill variant="neutral">Simulated</Pill>}
                  {r.verified && <Pill variant="up">On-chain</Pill>}
                </td>
                <td className={`num ${styles.right} ${r.returnPct > 0 ? 'trend-up' : r.returnPct < 0 ? 'trend-down' : ''}`}>
                  {formatPct(r.returnPct, 2)}
                </td>
                <td className={`num ${styles.right}`}>{formatHOOP(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
