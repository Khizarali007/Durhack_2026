import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Card } from '../../components/ui'
import { tour, tutorialStatus, useTourState } from '../tour/store'
import { nextTutorial, TUTORIALS } from '../tour/tutorials'
import { ChallengesSection } from './ChallengesSection'
import { GlossarySection } from './GlossarySection'
import { TutorialCard } from './TutorialCard'
import styles from './learn.module.css'

/** The /learn page: guided tutorials, the glossary and graded challenges. */
export function LearnMode() {
  const s = useTourState()
  const { hash } = useLocation()

  // "#glossary-spread" or "#tutorial-first-trade" scrolls to that card.
  useEffect(() => {
    if (!hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'center' })
  }, [hash])

  const playable = TUTORIALS.filter((t) => !t.comingSoon)
  const soon = TUTORIALS.length - playable.length
  const doneCount = playable.filter((t) => s.completed[t.id]).length
  const inProgress = playable.find((t) => s.runs[t.id])
  const startHere = inProgress ?? nextTutorial(s.completed)
  const startRun = startHere ? s.runs[startHere.id] : undefined

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.title}>Learn</h1>
          <p className={styles.lede}>
            Short guided tutorials that walk you through the real screens, one thing at a time. You trade with your own
            play money, so the lessons stick.
          </p>
          <div className={styles.progress}>
            <span className="num">
              {doneCount} of {playable.length} tutorials done
            </span>
            {soon > 0 && <span className={styles.muted}> · {soon} more coming soon</span>}
            <div className={styles.bar} aria-hidden="true">
              <div className={styles.barFill} style={{ transform: `scaleX(${playable.length ? doneCount / playable.length : 0})` }} />
            </div>
          </div>
        </div>

        <Card raised padding="lg" className={styles.startHere}>
          {startHere ? (
            <>
              <span className="label">{startRun ? 'Pick up where you left off' : 'Start here'}</span>
              <h2 className={styles.startTitle}>{startHere.title}</h2>
              <p className={styles.tutorialSummary}>{startHere.summary}</p>
              <p className={styles.meta}>
                <span className="num">{startHere.minutes} min</span>
                {startRun && (
                  <>
                    {' '}
                    · step <span className="num">{startRun.step + 1}</span> of <span className="num">{startHere.steps.length}</span>
                  </>
                )}
              </p>
              <Button variant="primary" size="lg" fullWidth onClick={() => tour.resume(startHere.id)}>
                {startRun ? 'Resume' : 'Start'}
              </Button>
            </>
          ) : (
            <>
              <span className="label">All done</span>
              <h2 className={styles.startTitle}>Every tutorial finished</h2>
              <p className={styles.tutorialSummary}>Try a graded challenge below, or replay any tutorial.</p>
            </>
          )}
        </Card>
      </header>

      <section className={styles.section} aria-labelledby="learn-tutorials">
        <div className={styles.sectionHead}>
          <h2 id="learn-tutorials" className={styles.sectionTitle}>
            Tutorials
          </h2>
          <span className={styles.count}>beginner first</span>
        </div>
        <div className={styles.grid}>
          {TUTORIALS.map((t) => {
            const run = s.runs[t.id]
            return (
              <TutorialCard
                key={t.id}
                tutorial={t}
                status={tutorialStatus(s, t.id, Boolean(t.comingSoon))}
                progress={run ? `step ${run.step + 1} of ${t.steps.length}` : undefined}
              />
            )
          })}
        </div>
      </section>

      <GlossarySection />
      <ChallengesSection />
    </div>
  )
}
