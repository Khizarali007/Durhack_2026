import { useEffect, useState } from 'react'
import { getReview, usePortfolio, useTrades } from '../api'
import type { SeasonReview } from '../api'
import TradesTable from '../components/orders/TradesTable'
import PayoutLedger from '../components/PayoutLedger'
import { CoachPanel, InsightCard, ReviewTimeline, SummaryStrip } from '../learning/review/ReviewParts'
import { TUTORIALS } from '../learning/tour/tutorials'
import { useTourState } from '../learning/tour/store'
import styles from './ActivityPage.module.css'

/** "Your season review": what you did, what it cost or earned you, and what to try next. */
export default function ActivityPage() {
  const trades = useTrades()
  const { portfolio } = usePortfolio()
  const tour = useTourState()
  const [data, setData] = useState<SeasonReview | null>(null)
  const [error, setError] = useState('')
  const paid = portfolio?.payouts_received ?? 0
  const equity = Math.round(portfolio?.equity ?? 0)

  // Refresh when trades, payouts or the portfolio's value change (not on every tick).
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
        if (alive) setError('The review is unavailable right now. It will refresh when the market reconnects.')
      })
    return () => {
      alive = false
    }
  }, [trades.length, paid, equity])

  const lessons = TUTORIALS.filter((t) => tour.completed[t.id]).map((t) => ({ title: t.title, at: tour.completed[t.id].at }))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Your season review</h1>
        <p className={styles.lede}>What you did, what it earned or cost you in H$, and one thing to try next.</p>
      </header>

      {error && <p className={styles.muted} role="status">{error}</p>}
      {!data && !error && <div className={`skeleton ${styles.skeleton}`} aria-busy="true" />}

      {data && (
        <>
          <SummaryStrip summary={data.summary} />

          <section className={styles.section} aria-labelledby="review-cards">
            <div className={styles.sectionHead}>
              <h2 id="review-cards" className={styles.sectionTitle}>Review</h2>
              <CoachPanel />
            </div>
            {data.insights.length === 0 ? (
              <p className={styles.muted}>
                No review cards yet. Make a few trades and play some days: the coach spots concentration, storms, panic
                sells, missed payouts, fees and good moves.
              </p>
            ) : (
              <div className={styles.cards}>
                {data.insights.map((ins, i) => (
                  <InsightCard key={`${ins.id}-${ins.symbol ?? ''}-${i}`} insight={ins} />
                ))}
              </div>
            )}
          </section>

          <div className={styles.columns}>
            <section className={styles.section} aria-labelledby="review-timeline">
              <h2 id="review-timeline" className={styles.sectionTitle}>Timeline</h2>
              <ReviewTimeline items={data.timeline} />
            </section>
            <aside className={styles.side}>
              <section className={styles.section} aria-labelledby="review-lessons">
                <h2 id="review-lessons" className={styles.sectionTitle}>Lessons completed</h2>
                {lessons.length === 0 ? (
                  <p className={styles.muted}>No tutorials finished yet. The Learn page has six short ones.</p>
                ) : (
                  <ul className={styles.lessons}>
                    {lessons.map((l) => (
                      <li key={l.title}>
                        ✓ {l.title}{' '}
                        <span className={styles.muted}>{new Date(l.at).toLocaleDateString('en-GB')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <PayoutLedger />
            </aside>
          </div>

          <details className={styles.receipts}>
            <summary>Every fill and its Solana receipt ({trades.length})</summary>
            <TradesTable trades={trades} showSymbol empty="Your trades will appear here." />
          </details>
        </>
      )}
    </div>
  )
}
