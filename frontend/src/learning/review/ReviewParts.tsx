import { useState } from 'react'
import { Link } from 'react-router-dom'
import { askCoach, errorDetail } from '../../api'
import type { CoachAnswer, Insight, TimelineItem } from '../../api'
import { PlayerAvatar } from '../../components/PlayerIdentity'
import { formatPnl } from '../../utils/format'
import { learnHref } from './links'
import styles from './review.module.css'

// Person 4's review pieces, drawn in Jonathan's overview style (holding rows, quiet labels,
// text actions, player portraits). Shared by Activity, Friends and the rival page.

function day(t: number): string {
  return new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** One review card as a row: what happened, what it cost or earned, what to try, where to learn it. */
export function InsightRow({ insight }: { insight: Insight }) {
  const praise = insight.tone === 'praise'
  return (
    <article className={styles.row}>
      {insight.symbol ? <PlayerAvatar player={{ symbol: insight.symbol }} /> : <span className={`player-monogram ${styles.mark}`} aria-hidden="true">{praise ? '✓' : '!'}</span>}
      <div className={styles.body}>
        <strong className={styles.title}>{insight.title}</strong>
        <p className={styles.text}>{insight.what}</p>
        <p className={styles.muted}>{insight.why}</p>
        <p className={styles.text}>
          <span className={styles.tag}>{praise ? 'Keep doing' : 'Next time'}</span> {insight.next_time}
        </p>
        <Link className="text-action" to={learnHref(insight.learn.kind, insight.learn.id, insight.learn.label)}>
          {insight.learn.kind === 'tutorial' ? 'Tutorial' : 'Glossary'}: {insight.learn.label} ↗
        </Link>
      </div>
      {insight.impact !== 0 && (
        <span className={`${styles.impact} ${insight.impact < 0 ? 'trend-down' : 'trend-up'}`}>{formatPnl(insight.impact)}</span>
      )}
    </article>
  )
}

/** Coach Hoops: three friendly bullets from your review (Gemini when configured, otherwise a template). */
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
      {!answer && (
        <button type="button" className={`text-action ${styles.linkButton}`} onClick={() => void ask()} disabled={busy}>
          {busy ? 'Coach Hoops is thinking…' : `${label} ↗`}
        </button>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {answer && (
        <div className={styles.coachAnswer} role="status">
          <span className="metric-label">Coach Hoops</span>
          <ul>
            {answer.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <span className="fine-print">
            {answer.source === 'gemini' ? 'Written by Gemini from your review.' : 'Written from your review.'} A practice
            game, not financial advice.
          </span>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  buy: 'Bought',
  sell: 'Sold',
  payout: 'Payment',
  alert: 'Injury news',
  grade: 'Diversification',
}

/** Everything that happened, newest first, in plain English. */
export function ReviewTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="empty-holdings">Nothing yet. Trades, payments and injury news on your players show up here.</p>
  return (
    <ol className={styles.timeline}>
      {items.map((item, i) => (
        <li key={`${item.t}-${i}`} className={styles.event}>
          {item.symbol ? <PlayerAvatar player={{ symbol: item.symbol }} size="sm" /> : <span className={styles.dot} aria-hidden="true" />}
          <span className={styles.eventBody}>
            <span className={styles.text}>{item.text}</span>
            <small className="quiet-label">
              {KIND_LABEL[item.kind]} · {day(item.t)}
            </small>
          </span>
        </li>
      ))}
    </ol>
  )
}
