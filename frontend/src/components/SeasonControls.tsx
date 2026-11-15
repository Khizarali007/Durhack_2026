import { useEffect, useRef, useState } from 'react'
import { changeTimeline, errorDetail, getSeasonScore, getTimeline, usePortfolio, useSession } from '../api'
import type { SeasonScore, Timeline, TimelineChange } from '../api'
import { formatHOOP, formatPct } from '../utils/format'
import { Button } from './ui'
import styles from './Season.module.css'

const SPEEDS = [1, 5, 20, 50, 200, 500]
const DAY = 86400

function formatSeasonDate(t: number): string {
  return new Date(t * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' })
}

/** The season bar: play/pause, speed, next day, jump to a date, and the live season score. */
export default function SeasonControls() {
  const [clock, setClock] = useState<Timeline | null>(null)
  const [score, setScore] = useState<SeasonScore | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const { session } = useSession()
  const { portfolio } = usePortfolio()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const c = await getTimeline()
        if (alive) setClock(c)
      } catch {
        if (alive) setError('Market unavailable. Reconnecting…')
      }
    }
    void load()
    const id = setInterval(() => void load(), 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!session) return
    const load = async () => {
      try {
        const s = await getSeasonScore()
        if (alive) setScore(s)
      } catch {
        if (alive) setScore(null)
      }
    }
    void load()
    const id = setInterval(() => void load(), 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [session])

  async function change(body: TimelineChange) {
    setWorking(true)
    setError('')
    try {
      setClock(await changeTimeline(body))
    } catch (e) {
      setError(errorDetail(e))
    } finally {
      setWorking(false)
    }
  }

  if (!clock) {
    return (
      <div className={styles.controls} role="status">
        {error || 'Connecting to the season…'}
      </div>
    )
  }

  const finished = clock.t >= clock.end_t
  const locked = working || clock.busy
  const nextDay = Math.min(clock.end_t, Math.floor(clock.t / DAY) * DAY + DAY)
  const minDate = new Date(clock.start_t * 1000).toISOString().slice(0, 10)
  const maxDate = new Date(clock.end_t * 1000).toISOString().slice(0, 10)
  const commitSlider = (value: number) => {
    setPreviewTime(null)
    void change({ target_t: value })
  }

  return (
    <section className={styles.controls} aria-label="Season challenge controls" data-tour="season-controls">
      <div className={styles.row}>
        <strong className={`num ${styles.date}`}>2024–25 season · {formatSeasonDate(clock.t)}</strong>
        <Button size="sm" variant="ghost" disabled={locked || finished} onClick={() => void change({ paused: !clock.paused })}>
          {clock.paused ? 'Play' : 'Pause'}
        </Button>
        <select
          className={styles.select}
          aria-label="Replay speed"
          value={clock.rate}
          disabled={locked}
          onChange={(e) => void change({ rate: Number(e.target.value) })}
        >
          {SPEEDS.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="primary"
          tourId="season-next-day"
          disabled={locked || finished}
          onClick={() => void change({ target_t: nextDay })}
        >
          Next day
        </Button>
        <Button size="sm" variant="ghost" disabled={locked || finished} onClick={() => void change({ target_t: clock.end_t })}>
          Finish season
        </Button>
        <label className={styles.jump}>
          <span>Jump to</span>
          <input
            className={styles.select}
            aria-label="Jump to season date"
            type="date"
            min={minDate}
            max={maxDate}
            ref={dateInput}
            disabled={locked}
          />
        </label>
        <Button
          size="sm"
          variant="ghost"
          disabled={locked}
          onClick={() => {
            const target = Date.parse(`${dateInput.current?.value ?? ''}T00:00:00Z`) / 1000
            if (Number.isFinite(target)) void change({ target_t: target })
            else setError('Choose a season date first')
          }}
        >
          Go to date
        </Button>
        <span className={styles.muted}>Rewinding restarts every portfolio (accounts are kept).</span>
      </div>

      <input
        className={styles.range}
        aria-label="Market timeline"
        type="range"
        min={clock.start_t}
        max={clock.end_t}
        step={DAY}
        value={previewTime ?? clock.t}
        disabled={locked}
        onChange={(e) => setPreviewTime(Number(e.target.value))}
        onPointerUp={(e) => commitSlider(Number(e.currentTarget.value))}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            commitSlider(Number(e.currentTarget.value))
          }
        }}
      />

      {clock.busy && (
        <span role="status" className={styles.status}>
          Replaying days and settling payouts… Trading resumes when it finishes.
        </span>
      )}
      {(error || clock.error) && (
        <span role="alert" className={styles.alert}>
          {error || clock.error}
        </span>
      )}

      {(session && score) || portfolio ? (
        <div className={styles.row}>
          {session && score && (
            <span>
              <strong>
                {finished ? 'Final season score' : 'Estimated exit value'}:{' '}
                <span className="num">{formatHOOP(score.score)}</span> ({formatPct(score.return_pct, 2)})
              </strong>{' '}
              <span className={styles.muted}>cash + net sale proceeds + pending payouts</span>
            </span>
          )}
          {portfolio && (
            <>
              <span>
                Spendable: <b className="num">{formatHOOP(portfolio.available_cash ?? portfolio.cash)}</b>
              </span>
              <span>
                Payouts credited: <b className="num">{formatHOOP(portfolio.payouts_received ?? 0)}</b>
              </span>
              <span className={styles.muted}>
                Pending entitlement: <span className="num">{formatHOOP(portfolio.pending_payouts ?? 0)}</span>
              </span>
            </>
          )}
          {score && Object.keys(score.unsold_shares).length > 0 && (
            <strong className={styles.alert}>Some shares can't be sold right now and count as H$0 in this estimate.</strong>
          )}
        </div>
      ) : null}
    </section>
  )
}
