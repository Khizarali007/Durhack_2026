import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRival, useComposition, usePortfolio } from '../api'
import type { CompositionOut, RivalDetail } from '../api'
import { ReviewTimeline } from '../learning/review/ReviewParts'
import EquityCompareChart from '../learning/rivals/EquityCompareChart'
import { RivalAvatar, RivalInsights, SimulatedTag } from '../learning/rivals/RivalBits'
import { formatHOOP, formatPct, formatPnl, formatQty } from '../utils/format'
import styles from './RivalPage.module.css'

function CompositionColumn({ title, comp }: { title: string; comp: CompositionOut | null }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h3 className={styles.panelTitle}>
        {title} <span className={styles.grade}>{comp?.grade ?? '–'}</span>
      </h3>
      {!comp || !comp.grade ? (
        <p className={styles.muted}>All cash so far.</p>
      ) : (
        <>
          <p className={styles.muted}>
            {comp.holdings} {comp.holdings === 1 ? 'player' : 'players'} · {comp.teams} {comp.teams === 1 ? 'team' : 'teams'} ·
            biggest player {comp.top_player_pct.toFixed(0)}%
          </p>
          <ul className={styles.bars}>
            {comp.by_team.slice(0, 5).map((s) => (
              <li key={s.key}>
                <span className={styles.barLabel}>{s.label}</span>
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.fill} style={{ transform: `scaleX(${Math.min(1, s.pct / 100)})` }} />
                </span>
                <span className="num">{s.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** One rival up close: equity vs yours, composition side by side, holdings, best/worst trade and key moves. */
export default function RivalPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<RivalDetail | null>(null)
  const [error, setError] = useState('')
  const { composition: mine } = useComposition()
  const { portfolio } = usePortfolio()
  const equity = Math.round(portfolio?.equity ?? 0)

  useEffect(() => {
    let alive = true
    getRival(id)
      .then((d) => {
        if (alive) {
          setData(d)
          setError('')
        }
      })
      .catch(() => {
        if (alive) setError('This rival could not be loaded.')
      })
    return () => {
      alive = false
    }
  }, [id, equity])

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>{error}</p>
        <Link to="/friends">Back to Friends</Link>
      </div>
    )
  }
  if (!data) return <div className={styles.page}><div className={`skeleton ${styles.skeleton}`} /></div>

  const { rival, review, your_summary: you } = data
  const s = review.summary
  return (
    <div className={styles.page}>
      <Link to="/friends" className={styles.back}>← Friends</Link>
      <header className={styles.header}>
        <RivalAvatar id={rival.id} name={rival.name} size="lg" />
        <div className={styles.headText}>
          <h1 className={styles.title}>
            {rival.name} <span className={styles.persona}>({rival.persona})</span>
          </h1>
          <p className={styles.muted}>{rival.strategy} A simulated trader from the market: invented name, real trades.</p>
        </div>
        <SimulatedTag />
      </header>

      <dl className={styles.tiles}>
        <div>
          <dt className="label">{rival.name}'s return</dt>
          <dd className={`num ${s.return_pct >= 0 ? 'trend-up' : 'trend-down'}`}>{formatPct(s.return_pct, 2)}</dd>
        </div>
        <div>
          <dt className="label">Your return</dt>
          <dd className={`num ${you.return_pct >= 0 ? 'trend-up' : 'trend-down'}`}>{formatPct(you.return_pct, 2)}</dd>
        </div>
        <div>
          <dt className="label">Payouts</dt>
          <dd className="num">{formatHOOP(s.payouts, 0)}</dd>
        </div>
        <div>
          <dt className="label">Best trade</dt>
          <dd className="num">{s.best_trade ? `${formatPnl(s.best_trade.pnl)} ${s.best_trade.symbol}` : '—'}</dd>
        </div>
        <div>
          <dt className="label">Worst trade</dt>
          <dd className="num">{s.worst_trade ? `${formatPnl(s.worst_trade.pnl)} ${s.worst_trade.symbol}` : '—'}</dd>
        </div>
        <div>
          <dt className="label">Trades</dt>
          <dd className="num">{s.trades}</dd>
        </div>
      </dl>

      <section className={styles.panel} aria-label="Equity">
        <h2 className={styles.panelTitle}>Season so far: {rival.name} vs you (% change)</h2>
        <EquityCompareChart rival={data.equity} you={data.your_equity} rivalName={rival.name} />
      </section>

      <RivalInsights id={rival.id} name={rival.name} />

      <div className={styles.split}>
        <CompositionColumn title={`${rival.name}'s composition`} comp={data.composition} />
        <CompositionColumn title="Your composition" comp={mine} />
      </div>

      <div className={styles.split}>
        <section className={styles.panel} aria-label="Top holdings">
          <h2 className={styles.panelTitle}>{rival.name}'s top holdings</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player</th>
                <th className={styles.right}>Shares</th>
                <th className={styles.right}>Value</th>
              </tr>
            </thead>
            <tbody>
              {data.top_holdings.map((h) => (
                <tr key={h.symbol}>
                  <td>
                    <Link to={`/stock/${h.symbol}`}>{h.name}</Link>
                  </td>
                  <td className={`num ${styles.right}`}>{formatQty(h.qty)}</td>
                  <td className={`num ${styles.right}`}>{formatHOOP(h.value, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={styles.panel} aria-label="Key moves">
          <h2 className={styles.panelTitle}>{rival.name}'s key moves</h2>
          <div className={styles.scroll}>
            <ReviewTimeline items={review.timeline.filter((i) => i.kind !== 'grade').slice(0, 40)} />
          </div>
        </section>
      </div>
    </div>
  )
}
