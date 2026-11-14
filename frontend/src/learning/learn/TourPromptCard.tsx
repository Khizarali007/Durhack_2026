import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'
import { tour, useTourState } from '../tour/store'
import { nextTutorial, TUTORIALS } from '../tour/tutorials'
import styles from './learn.module.css'

/** One-line invitation for the Home page's mission-card mount: the next tutorial to take. */
export function TourPromptCard() {
  const s = useTourState()
  const inProgress = TUTORIALS.find((t) => s.runs[t.id] && !t.comingSoon)
  const next = inProgress ?? nextTutorial(s.completed)
  if (!next) {
    return (
      <div className={styles.prompt}>
        <span className={styles.promptText}>
          <span className={styles.promptTitle}>Every tutorial done.</span>
          <span className={styles.muted}>Graded challenges and the glossary live on the Learn page.</span>
        </span>
        <Link to="/learn">Open Learn</Link>
      </div>
    )
  }
  const first = next.id === TUTORIALS[0].id && !inProgress
  return (
    <div className={styles.prompt}>
      <span className={styles.promptText}>
        <span className={styles.promptTitle}>{first ? 'New here? Take the 2-minute tour.' : `Next lesson: ${next.title}`}</span>
        <span className={styles.muted}>{next.summary}</span>
      </span>
      <Button variant="primary" size="sm" onClick={() => tour.resume(next.id)}>
        {inProgress ? 'Resume' : first ? 'Take the tour' : 'Start'}
      </Button>
    </div>
  )
}
