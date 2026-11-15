import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Pill } from '../../components/ui'
import { missionLesson } from '../content'
import { formatHoop, formatPrice } from '../format'
import debrief from '../MissionDebriefView.module.css'
import tokens from '../tokens.module.css'
import { summariseTrades } from './summary'
import { tour } from './store'
import type { TutorialTrade } from './types'
import { findTutorial, nextTutorial } from './tutorials'
import styles from './tour.module.css'

interface TutorialCompleteProps {
  tutorialId: string
  trades: TutorialTrade[]
  completed: Record<string, unknown>
}

/** End-of-tutorial card, in the same style as the mission debrief. */
export function TutorialComplete({ tutorialId, trades, completed }: TutorialCompleteProps) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const tutorial = findTutorial(tutorialId)
  const next = nextTutorial(completed, tutorialId)
  const s = summariseTrades(trades)
  const lesson = tutorial?.missionNumber ? missionLesson(tutorial.missionNumber) : null
  const titleId = `tour-done-${tutorialId}`

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tour.dismissFinished()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!tutorial) return null

  const backToLearn = () => {
    tour.dismissFinished()
    navigate('/learn')
  }

  return (
    <div className={styles.root}>
      <div className={styles.dim} style={{ inset: 0 }} onClick={() => tour.dismissFinished()} />
      <div ref={ref} className={`${tokens.tokens} ${debrief.root} ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <Card raised padding="none" className={`${debrief.card} ${debrief.pass}`}>
          <header className={debrief.head}>
            <span className="label">Tutorial complete · {tutorial.title}</span>
            <Button variant="ghost" size="sm" onClick={() => tour.dismissFinished()}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </Button>
          </header>

          <div className={debrief.body}>
            <div className={debrief.verdict}>
              <Pill variant="up">Done</Pill>
              <h2 id={titleId} className={debrief.title}>
                Nice work!
              </h2>
              <p className={debrief.sub}>{tutorial.summary}</p>
            </div>

            {trades.length > 0 && (
              <dl className={debrief.stats}>
                <div>
                  <dt className="label">Bought</dt>
                  <dd className="num">
                    {s.boughtQty > 0 ? `${s.boughtQty} @ ${formatPrice(s.avgBuy)}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="label">Sold</dt>
                  <dd className="num">{s.soldQty > 0 ? `${s.soldQty} @ ${formatPrice(s.avgSell)}` : '—'}</dd>
                </div>
                <div>
                  <dt className="label">Exercise P/L</dt>
                  <dd className="num">
                    {s.realised === null ? (
                      <Pill variant="neutral">still holding</Pill>
                    ) : (
                      <Pill variant={s.realised > 0 ? 'up' : s.realised < 0 ? 'down' : 'neutral'}>{formatHoop(s.realised)}</Pill>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="label">Stock</dt>
                  <dd className="num">{s.symbols.join(', ')}</dd>
                </div>
              </dl>
            )}

            {trades.length > 0 && <p className={debrief.sub}>Exercise figures cover only trades recorded during this tutorial, excluding earlier holdings and performance payouts.</p>}
            <div>
              <span className="label">What you covered</span>
              <ul className={styles.recap}>
                {tutorial.recap.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {lesson && (
              <aside className={debrief.lesson}>
                <span className="label">Today&apos;s forecast</span>
                <p>{lesson}</p>
              </aside>
            )}

            <div className={debrief.actions}>
              {next ? (
                <Button variant="primary" onClick={() => tour.start(next.id)}>
                  Next: {next.title}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={backToLearn}>
                Back to Learn
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
