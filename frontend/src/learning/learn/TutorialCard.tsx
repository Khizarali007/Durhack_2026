import { Button, Card, Pill } from '../../components/ui'
import { tour } from '../tour/store'
import type { TutorialStatus } from '../tour/store'
import type { Tutorial } from '../tour/types'
import styles from './learn.module.css'

const STATUS: Record<TutorialStatus, { label: string; tone: 'up' | 'down' | 'neutral' | 'accent' }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'accent' },
  done: { label: 'Done', tone: 'up' },
  coming_soon: { label: 'Coming soon', tone: 'neutral' },
}

export interface TutorialCardProps {
  tutorial: Tutorial
  status: TutorialStatus
  /** "Step 4 of 21" for a tutorial in progress. */
  progress?: string
}

export function TutorialCard({ tutorial, status, progress }: TutorialCardProps) {
  const s = STATUS[status]
  const soon = status === 'coming_soon'
  return (
    <Card padding="md" className={`${styles.tutorial} ${soon ? styles.soon : ''}`}>
      <div id={`tutorial-${tutorial.id}`} className={styles.anchor} />
      <div className={styles.tutorialHead}>
        <span className={`num ${styles.tutorialNum}`}>{tutorial.number}</span>
        <Pill variant={s.tone}>{s.label}</Pill>
      </div>
      <h3 className={styles.tutorialTitle}>{tutorial.title}</h3>
      <p className={styles.tutorialSummary}>{tutorial.summary}</p>
      <p className={styles.meta}>
        <span className="num">{tutorial.minutes} min</span>
        {!soon && <> · {tutorial.steps.length} steps</>}
        {progress && <> · {progress}</>}
      </p>
      {soon && tutorial.comingSoon && <p className={styles.soonNote}>{tutorial.comingSoon}</p>}
      <div className={styles.cardActions}>
        {status === 'not_started' && (
          <Button variant="primary" size="sm" onClick={() => tour.start(tutorial.id)}>
            Start
          </Button>
        )}
        {status === 'in_progress' && (
          <>
            <Button variant="primary" size="sm" onClick={() => tour.resume(tutorial.id)}>
              Resume
            </Button>
            <Button variant="ghost" size="sm" onClick={() => tour.start(tutorial.id)}>
              Restart
            </Button>
          </>
        )}
        {status === 'done' && (
          <Button variant="ghost" size="sm" onClick={() => tour.start(tutorial.id)}>
            Restart
          </Button>
        )}
        {soon && (
          <Button variant="ghost" size="sm" disabled>
            Coming soon
          </Button>
        )}
      </div>
    </Card>
  )
}
