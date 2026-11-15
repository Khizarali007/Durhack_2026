import { useState } from 'react'
import type { MissionEntry, MissionResult } from '../api'
import { useMission } from './hooks/useMission'
import type { MissionHandle } from './hooks/useMission'
import { MissionDebriefView } from './MissionDebriefView'

export interface MissionDebriefProps {
  /** Player id: the same id Person 2's trading uses. */
  userId: string
  /** Backend base URL. Default http://localhost:8001; '' when /learning is same-origin. */
  apiBase?: string
  /** Optional shared object from useMission(). */
  mission?: MissionHandle
  /** Override Retry (default: restart the same mission over the API). */
  onRetry?: (result: MissionResult) => void
  /** Override Next (default: start the next available mission over the API). */
  onNext?: (nextMission: MissionEntry) => void
  /** Show a close button. Default true. */
  dismissible?: boolean
  projector?: boolean
  className?: string
}

/** Appears when the user's mission ends; renders nothing otherwise. */
export function MissionDebrief({
  userId,
  apiBase,
  mission: shared,
  onRetry,
  onNext,
  dismissible = true,
  projector,
  className,
}: MissionDebriefProps) {
  const own = useMission({ apiBase, userId, enabled: !shared })
  const m = shared ?? own
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const { result, status } = m

  if (!result || status?.state === 'running') return null
  const key = `${result.mission_id}:${result.end_t}`
  if (dismissedKey === key) return null

  const entry = m.missions.find((x) => x.id === result.mission_id) ?? null
  const next = entry ? (m.missions.find((x) => x.available && x.number > entry.number) ?? null) : null

  return (
    <MissionDebriefView
      result={result}
      entry={entry}
      nextMission={next}
      busy={m.busy}
      projector={projector}
      className={className}
      onRetry={() => (onRetry ? onRetry(result) : void m.start(result.mission_id))}
      onNext={next ? () => (onNext ? onNext(next) : void m.start(next.id)) : undefined}
      onClose={dismissible ? () => setDismissedKey(key) : undefined}
    />
  )
}
