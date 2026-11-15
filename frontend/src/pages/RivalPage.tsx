import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRival, usePortfolio } from '../api'
import type { RivalDetail } from '../api'
import { PlayerAvatar } from '../components/PlayerIdentity'
import { ReviewTimeline } from '../learning/review/ReviewParts'
import EquityCompareChart from '../learning/rivals/EquityCompareChart'
import { RivalInsights } from '../learning/rivals/RivalBits'
import rivalStyles from '../learning/rivals/rivals.module.css'
import { formatHOOP, formatPct, formatPnl, formatQty } from '../utils/format'
import '../components/season.css'

/** One practice rival: their season against yours, what they own and their key moves. */
export default function RivalPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<RivalDetail | null>(null)
  const [error, setError] = useState('')
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
      <div className="overview-page">
        <p role="alert">{error}</p>
        <Link className="text-action" to="/friends">← Friends</Link>
      </div>
    )
  }
  if (!data) return <div className="overview-page"><p className="quiet-label">Loading…</p></div>

  const { rival, review, your_summary: you, composition: comp } = data
  const s = review.summary
  const diff = s.return_pct - you.return_pct
  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>{rival.name}</h1>
        <span className="quiet-label">
          {rival.persona} <span className="separator">/</span> Simulated trader <span className="separator">/</span>{' '}
          <Link className="text-action" to="/friends">All rivals</Link>
        </span>
      </header>
      <p className="quiet-label">
        {rival.strategy} A computer trader from the market with a made-up name; every number is real. Money amounts are
        scaled to a H$100 start, like yours.
      </p>

      <section className="balance-panel" aria-label={`${rival.name}'s season`}>
        <div className="balance-main">
          <span className="metric-label">{rival.name}'s season return</span>
          <strong className="balance-number">{formatPct(s.return_pct, 2)}</strong>
          <span className={diff >= 0 ? 'trend-up' : 'trend-down'}>
            {diff >= 0 ? '+' : ''}
            {diff.toFixed(2)} pts vs you
          </span>
        </div>
        <dl className="balance-stats">
          <div>
            <dt>Your return</dt>
            <dd>{formatPct(you.return_pct, 2)}</dd>
          </div>
          <div>
            <dt>Payments received</dt>
            <dd>{formatHOOP(s.payouts)}</dd>
          </div>
          <div>
            <dt>Trades</dt>
            <dd>{formatQty(s.trades)}</dd>
          </div>
          <div>
            <dt>Best sale</dt>
            <dd>{s.best_trade ? formatPnl(s.best_trade.pnl) : '—'}</dd>
          </div>
          <div>
            <dt>Diversification</dt>
            <dd>{comp.grade ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <div className="overview-grid">
        <div className={rivalStyles.stack}>
          <section className="holdings-panel" aria-label="Season so far">
            <div className="panel-heading">
              <h2>Season so far</h2>
              <span className="quiet-label">{rival.name} vs you · % change</span>
            </div>
            <EquityCompareChart rival={data.equity} you={data.your_equity} rivalName={rival.name} />
            <RivalInsights id={rival.id} name={rival.name} open />
          </section>
        </div>

        <div className={rivalStyles.stack}>
          <section className="holdings-panel" aria-label="Top holdings">
            <div className="panel-heading">
              <h2>
                Top holdings <span className="count-badge">{comp.holdings}</span>
              </h2>
              <span className="quiet-label">{comp.teams} teams</span>
            </div>
            <div className="holdings-list">
              {data.top_holdings.map((h) => (
                <Link key={h.symbol} to={`/stock/${h.symbol}`} className="holding-item">
                  <PlayerAvatar player={{ symbol: h.symbol, name: h.name }} />
                  <span className="holding-name">
                    <strong>{h.name}</strong>
                    <small>{h.weight_pct.toFixed(1)}% of holdings</small>
                  </span>
                  <span className="holding-value">
                    <strong>{formatHOOP(h.value)}</strong>
                  </span>
                  <span className="row-arrow" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="holdings-panel" aria-label="Key moves">
            <div className="panel-heading">
              <h2>Key moves</h2>
              <span className="quiet-label">Newest first</span>
            </div>
            <div className="holdings-list">
              <ReviewTimeline items={review.timeline.filter((i) => i.kind !== 'grade').slice(0, 40)} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
