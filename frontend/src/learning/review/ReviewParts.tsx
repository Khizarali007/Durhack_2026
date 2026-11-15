import { useState } from 'react'
import { Link } from 'react-router-dom'
import { askCoach, errorDetail } from '../../api'
import type { CoachAnswer, Insight, ReviewSummary, TimelineItem } from '../../api'
import { Button, Pill } from '../../components/ui'
import { formatHOOP, formatPct, formatPnl } from '../../utils/format'
import { learnHref } from './links'
import styles from './review.module.css'

function day(t: number): string {
  return new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Season return, payouts, fees, best/worst trade, drawdown, grade and the biggest lesson. */
export function SummaryStrip({ summary }: { summary: ReviewSummary }) {
  const trend = summary.return_pct > 0 ? 'trend-up' : summary.return_pct < 0 ? 'trend-down' : 'trend-flat'
  return (
    <section className={styles.summary} aria-label="Season summary">
      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt className="label">Season return</dt>
          <dd className={`num ${styles.big} ${trend}`}>{formatPct(summary.return_pct, 2)}</dd>
          <span className={styles.sub}>
            worth <span className="num">{formatHOOP(summary.equity)}</span>
          </span>
        </div>
        <div className={styles.tile}>
          <dt className="label">Payouts earned</dt>
          <dd className="num trend-up">{formatHOOP(summary.payouts)}</dd>
        </div>
        <div className={styles.tile}>
          <dt className="label">Fees paid</dt>
          <dd className="num">{formatHOOP(summary.fees)}</dd>
          <span className={styles.sub}>{summary.trades} {summary.trades === 1 ? 'order' : 'orders'}</span>
        </div>
        <div className={styles.tile}>
          <dt className="label">Best trade</dt>
          <dd className="num">{summary.best_trade ? formatPnl(summary.best_trade.pnl) : '—'}</dd>
          <span className={styles.sub}>{summary.best_trade ? `${summary.best_trade.symbol} · ${day(summary.best_trade.t)}` : 'no sales yet'}</span>
        </div>
        <div className={styles.tile}>
          <dt className="label">Worst trade</dt>
          <dd className="num">{summary.worst_trade ? formatPnl(summary.worst_trade.pnl) : '—'}</dd>
          <span className={styles.sub}>{summary.worst_trade ? `${summary.worst_trade.symbol} · ${day(summary.worst_trade.t)}` : '—'}</span>
        </div>
        <div className={styles.tile}>
          <dt className="label">Max drawdown</dt>
          <dd className="num">{formatPct(summary.max_drawdown_pct, 2)}</dd>
          <span className={styles.sub}>biggest fall from a peak</span>
        </div>
        <div className={styles.tile}>
          <dt className="label">Composition</dt>
          <dd className={styles.grade}>{summary.grade ?? '–'}</dd>
          <span className={styles.sub} title={summary.grade_reason}>{summary.grade ? 'how spread you are' : 'all cash'}</span>
        </div>
      </dl>
      <p className={styles.lesson}>
        <span className="label">Your biggest lesson</span>
        <span>{summary.biggest_lesson}</span>
      </p>
    </section>
  )
}

/** One review card: what happened, why it mattered in H$, what to do next time, where to learn it. */
export function InsightCard({ insight }: { insight: Insight }) {
  const praise = insight.tone === 'praise'
  return (
    <article className={`${styles.card} ${praise ? styles.praise : styles.warning}`}>
      <header className={styles.cardHead}>
        <Pill variant={praise ? 'up' : 'down'}>{praise ? 'Good move' : 'Lesson'}</Pill>
        {insight.impact !== 0 && (
          <span className={`num ${styles.impact} ${insight.impact < 0 ? 'trend-down' : 'trend-up'}`}>{formatPnl(insight.impact)}</span>
        )}
      </header>
      <h3 className={styles.cardTitle}>{insight.title}</h3>
      <p className={styles.what}>{insight.what}</p>
      <p className={styles.why}>{insight.why}</p>
      <p className={styles.next}>
        <span className="label">Next time</span> {insight.next_time}
      </p>
      <Link className={styles.learn} to={learnHref(insight.learn.kind, insight.learn.id, insight.learn.label)}>
        {insight.learn.kind === 'tutorial' ? 'Tutorial' : 'Glossary'}: {insight.learn.label} →
      </Link>
    </article>
  )
}

/** "Explain with Coach Hoops": three friendly bullets, from Gemini or a template built from the same facts. */
export function CoachPanel({ rivalId, label = 'Explain with Coach Hoops' }: { rivalId?: string; label?: string }) {
  const [answer, setAnswer] = useState<CoachAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask() {
    setBusy(true)
    setError('')
    try {
      setAnswer(await askCoach(rivalId))
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.coach}>
      <Button variant="ghost" onClick={() => void ask()} disabled={busy}>
        {busy ? 'Coach Hoops is thinking…' : answer ? 'Ask again' : label}
      </Button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {answer && (
        <div className={styles.coachAnswer} role="status">
          <ul>
            {answer.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <span className={styles.sub}>
            Coach Hoops · {answer.source === 'gemini' ? 'worded by Gemini from your review' : 'from your review'} · practice game, not
            financial advice
          </span>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  buy: 'Buy',
  sell: 'Sell',
  payout: 'Payout',
  alert: 'Alert',
  grade: 'Grade',
}

/** Everything that happened, newest first, in plain English. */
export function ReviewTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className={styles.sub}>Nothing yet. Trades, payouts and alerts on your players appear here.</p>
  return (
    <ol className={styles.timeline}>
      {items.map((item, i) => (
        <li key={`${item.t}-${i}`} className={styles.event}>
          <span className={`num ${styles.when}`}>{day(item.t)}</span>
          <span className={`${styles.kind} ${styles[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
          <span className={styles.text}>{item.text}</span>
        </li>
      ))}
    </ol>
  )
}
