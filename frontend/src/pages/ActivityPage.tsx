import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReview, usePortfolio, useTrades } from '../api'
import type { SeasonReview } from '../api'
import { useSeason } from '../api/useSeason'
import TradesTable from '../components/orders/TradesTable'
import { CoachPanel, InsightRow, ReviewTimeline } from '../learning/review/ReviewParts'
import { TUTORIALS } from '../learning/tour/tutorials'
import { useTourState } from '../learning/tour/store'
import { formatHOOP, formatPct, formatPnl } from '../utils/format'
import '../components/season.css'

/**
 * Activity = what YOU did and how to improve (Person 4's review), in Jonathan's overview layout.
 * Updates = what happened each week (Jonathan's reports). Money totals come from his reconciled
 * season score; the review rules add best/worst sale, biggest drop and lessons.
 */
export default function ActivityPage() {
  const trades = useTrades()
  const { portfolio } = usePortfolio()
  const { score } = useSeason()
  const tour = useTourState()
  const [data, setData] = useState<SeasonReview | null>(null)
  const [error, setError] = useState('')
  const paid = portfolio?.payouts_received ?? 0
  const equity = Math.round(portfolio?.equity ?? 0)

  useEffect(() => {
    let alive = true
    getReview()
      .then((r) => {
        if (alive) {
          setData(r)
          setError('')
        }
      })
      .catch(() => {
        if (alive) setError('Your review is unavailable right now. It refreshes when the game reconnects.')
      })
    return () => {
      alive = false
    }
  }, [trades.length, paid, equity])

  const lessons = TUTORIALS.filter((t) => tour.completed[t.id])
  const s = data?.summary
  const gain = score ? score.score - score.starting_cash : null

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Activity</h1>
        <span className="quiet-label">
          What you did and how to improve <span className="separator">/</span>{' '}
          <Link className="text-action" to="/updates">Weekly reports ↗</Link>
        </span>
      </header>

      {error && <p role="alert">{error}</p>}

      <section className="balance-panel" aria-label="Season summary">
        <div className="balance-main">
          <span className="metric-label">
            Season return <span title="From your season score: cash + estimated sale proceeds after costs + pending payments" className="metric-info">ⓘ</span>
          </span>
          <strong className="balance-number">{score ? formatPct(score.return_pct, 2) : '—'}</strong>
          {gain !== null && <span className={gain >= 0 ? 'trend-up' : 'trend-down'}>{formatPnl(gain)}</span>}
        </div>
        <dl className="balance-stats">
          <div>
            <dt>Payments received</dt>
            <dd>{score ? formatHOOP(score.payouts_received) : '—'}</dd>
          </div>
          <div>
            <dt>Fees paid</dt>
            <dd>{score ? formatHOOP(score.fees_paid) : '—'}</dd>
          </div>
          <div>
            <dt>Best sale</dt>
            <dd>{s?.best_trade ? formatPnl(s.best_trade.pnl) : '—'}</dd>
          </div>
          <div>
            <dt>Biggest drop</dt>
            <dd>{s ? formatPct(s.max_drawdown_pct, 2) : '—'}</dd>
          </div>
          <div>
            <dt>Diversification</dt>
            <dd>{s?.grade ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {s && (
        <section className="season-review" aria-label="Your biggest lesson">
          <span className="metric-label">Your biggest lesson</span>
          <p>{s.biggest_lesson}</p>
        </section>
      )}

      <div className="overview-grid">
        <section className="holdings-panel" aria-label="Review">
          <div className="panel-heading">
            <h2>
              Review <span className="count-badge">{data?.insights.length ?? 0}</span>
            </h2>
            <CoachPanel />
          </div>
          {data && data.insights.length === 0 && (
            <p className="empty-holdings">
              Nothing to review yet. Buy a few players and let the season play: you'll see what worked and what to try next.
            </p>
          )}
          {data?.insights.map((ins, i) => <InsightRow key={`${ins.id}-${ins.symbol ?? ''}-${i}`} insight={ins} />)}
        </section>

        <section className="holdings-panel" aria-label="Timeline">
          <div className="panel-heading">
            <h2>Timeline</h2>
            <span className="quiet-label">Newest first</span>
          </div>
          <div className="holdings-list">{data && <ReviewTimeline items={data.timeline} />}</div>
          <details className="result-details panel-foot">
            <summary>
              Lessons completed · {lessons.length} <span>＋</span>
            </summary>
            {lessons.length === 0 ? (
              <p className="fine-print">No tutorials finished yet. <Link to="/learn">Learn</Link> has six short ones.</p>
            ) : (
              lessons.map((t) => <p key={t.id} className="fine-print">✓ {t.title}</p>)
            )}
          </details>
        </section>
      </div>

      <details className="result-details">
        <summary>
          Every trade and its Solana receipt ({trades.length}) <span>＋</span>
        </summary>
        <TradesTable trades={trades} showSymbol empty="Your trades will appear here." />
      </details>
    </div>
  )
}
