import { useState } from 'react'
import { Link } from 'react-router-dom'
import { compareRival, errorDetail } from '../../api'
import type { RivalComparison } from '../../api'
import { Button, Pill } from '../../components/ui'
import { CoachPanel } from '../review/ReviewParts'
import { learnHref } from '../review/links'
import styles from './rivals.module.css'

const AVATAR_CLASS: Record<string, string> = {
  maya: styles.maya,
  theo: styles.theo,
  priya: styles.priya,
  sam: styles.sam,
  jordan: styles.jordan,
  you: styles.you,
}

/** Initials in a token colour. Rivals are fictional; no photos, ever. */
export function RivalAvatar({ id, name, size = 'md' }: { id: string; name: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`${styles.avatar} ${size === 'lg' ? styles.avatarLg : ''} ${AVATAR_CLASS[id] ?? styles.you}`} aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

export function SimulatedTag() {
  return <Pill variant="neutral">Simulated trader</Pill>
}

/** "Insights": what this rival did differently from you, what to try, and Coach Hoops. */
export function RivalInsights({ id, name }: { id: string; name: string }) {
  const [data, setData] = useState<RivalComparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      setData(await compareRival(id))
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div className={styles.insights}>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
          {busy ? 'Comparing…' : `Insights: you vs ${name}`}
        </Button>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className={`${styles.insights} ${styles.insightsOpen}`} role="region" aria-label={`You vs ${name}`}>
      <h3 className={styles.insightsTitle}>What {name} did differently</h3>
      <ul className={styles.diffs}>
        {data.differences.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className={styles.try}>
        <span className="label">Try</span>{' '}
        <Link to={learnHref(data.try.kind, data.try.id, data.try.label)}>
          {data.try.kind === 'tutorial' ? 'the tutorial' : 'the glossary entry'} “{data.try.label}” →
        </Link>
      </p>
      <CoachPanel rivalId={id} label={`Coach Hoops: me vs ${name}`} />
    </div>
  )
}
