import { Component, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createLearningApi, LEARNING_API_BASE, useSession } from '../../api'
import { Button, Card } from '../../components/ui'
import { MissionDebrief } from '../MissionDebrief'
import { MissionPanel } from '../MissionPanel'
import { useMission } from '../hooks/useMission'
import styles from './learn.module.css'

type Health = 'checking' | 'up' | 'down'

// One check per page load, shared by every mount (StrictMode, revisits to /learn).
let healthCheck: Promise<boolean> | null = null

function checkHealth(force = false): Promise<boolean> {
  if (healthCheck === null || force) {
    healthCheck = createLearningApi(LEARNING_API_BASE)
      .health()
      .then((h) => h?.status === 'ok')
      .catch(() => false)
  }
  return healthCheck
}

function CalmCard({ text }: { text: string }) {
  return (
    <Card padding="md">
      <p className={styles.muted}>{text}</p>
    </Card>
  )
}

/** Keeps a failure in the challenges from taking the rest of the Learn page with it. */
class Contain extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <CalmCard text="Graded challenges hit a snag. The tutorials above still work." /> : this.props.children
  }
}

function Challenges({ userId }: { userId: string }) {
  const mission = useMission({ apiBase: LEARNING_API_BASE, userId })
  return (
    <div className={styles.challenges}>
      <MissionPanel userId={userId} mission={mission} />
      <MissionDebrief userId={userId} mission={mission} />
    </div>
  )
}

/** Person 4's graded missions. Only shown when the learning server answers. */
export function ChallengesSection() {
  const [health, setHealth] = useState<Health>('checking')
  const { session } = useSession({ autoGuest: false })
  const userId = session?.user_id ?? null

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void checkHealth(attempt > 0).then((ok) => {
      if (live) setHealth(ok ? 'up' : 'down')
    })
    return () => {
      live = false
    }
  }, [attempt])

  return (
    <section className={styles.section} aria-labelledby="learn-challenges">
      <div className={styles.sectionHead}>
        <h2 id="learn-challenges" className={styles.sectionTitle}>
          Challenges
        </h2>
        <span className={styles.count}>graded 0-100</span>
      </div>
      <p className={styles.muted}>Timed missions with a score. The tutorials teach the moves; challenges test them.</p>
      {health === 'checking' && <div className={`skeleton ${styles.skeleton}`} aria-busy="true" />}
      {health === 'down' && (
        <Card padding="md" className={styles.calm}>
          <p className={styles.muted}>Graded challenges switch on when the learning server is running.</p>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Check again
          </Button>
        </Card>
      )}
      {health === 'up' && !userId && <CalmCard text="Graded challenges need an account. Join as a guest to play." />}
      {health === 'up' && userId && (
        <Contain>
          <Challenges userId={userId} />
        </Contain>
      )}
    </section>
  )
}
