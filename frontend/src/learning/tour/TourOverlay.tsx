import { useEffect } from 'react'
import { subscribeEvents, useSession } from '../../api'
import type { OrderOut } from '../../api'
import { recordEvent, recordOrder, syncLearningAccount, useTourState } from './store'
import { TourStep } from './TourStep'
import { TutorialComplete } from './TutorialComplete'
import { findTutorial } from './tutorials'

/**
 * Learn mode's coach overlay. Mount once, inside the router. It renders nothing
 * unless a tutorial is running or has just finished.
 */
export function TourOverlay() {
  const s = useTourState()
  const {session} = useSession({autoGuest:false})

  useEffect(() => { syncLearningAccount(session?.user_id ?? null) }, [session?.user_id])
  useEffect(() => {
    const onFill = (event: Event) => recordOrder((event as CustomEvent<OrderOut>).detail)
    window.addEventListener('learning-order-filled', onFill)
    return () => window.removeEventListener('learning-order-filled', onFill)
  }, [])
  useEffect(() => subscribeEvents(recordEvent), [])

  if (s.finishedId) {
    return <TutorialComplete tutorialId={s.finishedId} trades={s.completed[s.finishedId]?.trades ?? []} completed={s.completed} />
  }

  const tutorial = findTutorial(s.activeId)
  const run = s.activeId ? s.runs[s.activeId] : undefined
  if (!s.running || !tutorial || !run || tutorial.steps.length === 0) return null
  const index = Math.min(run.step, tutorial.steps.length - 1)

  return <TourStep key={`${tutorial.id}:${index}`} tutorial={tutorial} run={run} index={index} />
}
