import { useState } from 'react'
import { Link } from 'react-router-dom'
import { compareRival, errorDetail } from '../../api'
import type { RivalComparison } from '../../api'
import { CoachPanel } from '../review/ReviewParts'
import { learnHref } from '../review/links'
import styles from './rivals.module.css'

/** Initials tile in Jonathan's monogram style. Rivals are made up, so never a photo. */
export function RivalAvatar({ name }: { name: string }) {
  return (
    <span className="player-monogram" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/** "Compare with you": what this rival did differently, what to try, and Coach Hoops. Loads when opened. */
export function RivalInsights({ id, name, open = false }: { id: string; name: string; open?: boolean }) {
  const [data, setData] = useState<RivalComparison | null>(null)
  const [error, setError] = useState('')
  const [requested, setRequested] = useState(false)

  function load() {
    if (requested) return
    setRequested(true)
    compareRival(id)
      .then(setData)
      .catch((err: unknown) => setError(errorDetail(err)))
  }

  return (
    <details
      className={`result-details ${styles.compare}`}
      open={open || undefined}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) load()
      }}
      ref={(el) => {
        if (el?.open && !requested) load()
      }}
    >
      <summary>
        Insights: you vs {name} <span>＋</span>
      </summary>
      {error && <p className="fine-print" role="alert">{error}</p>}
      {!data && !error && <p className="fine-print">Comparing…</p>}
      {data && (
        <div className={styles.body}>
          <ul className={styles.diffs}>
            {data.differences.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="fine-print">
            Try:{' '}
            <Link className="text-action" to={learnHref(data.try.kind, data.try.id, data.try.label)}>
              {data.try.label} ↗
            </Link>
          </p>
          <CoachPanel rivalId={id} label={`Ask Coach Hoops about you vs ${name}`} />
        </div>
      )}
    </details>
  )
}
