import { useState } from 'react'
import type { MissionEntry, MissionStatus } from '../api'
import { useMission, useSecondsLeft } from './hooks/useMission'
import type { MissionHandle } from './hooks/useMission'
import type { SocketStatus } from './hooks/useLearningSocket'
import { Button, Card, Pill } from '../components/ui'
import { FeedItem } from './FeedItem'
import { HelpTip } from './HelpTip'
import { MissionList } from './MissionList'
import { formatClock } from './format'
import { HELP, STATE_LABEL, countdownAnnouncement } from './missionCopy'
import tokens from './tokens.module.css'
import styles from './MissionPanel.module.css'

export interface MissionPanelProps {
  /** Player id: the same id Person 2's trading uses. */
  userId: string
  /** Backend base URL. Default http://localhost:8001; '' when /learning is same-origin. */
  apiBase?: string
  /** Optional object from useMission(); pass the same one to MissionDebrief to share one connection. */
  mission?: MissionHandle
  /** Bigger type and higher contrast (or put data-projector="true" on any ancestor). */
  projector?: boolean
  className?: string
}

const CONNECTION: Record<SocketStatus, { label: string; tone: 'accent' | 'down' | 'neutral' }> = {
  open: { label: 'Live', tone: 'accent' },
  reconnecting: { label: 'Reconnecting…', tone: 'down' },
  connecting: { label: 'Connecting…', tone: 'neutral' },
  closed: { label: 'Offline', tone: 'neutral' },
}

/** Mission list plus the active mission: goal, countdown, hints, live feed, Start/Stop. */
export function MissionPanel({ userId, apiBase, mission: shared, projector, className }: MissionPanelProps) {
  const own = useMission({ apiBase, userId, enabled: !shared })
  const m = shared ?? own
  const { missions, status, passedIds, busy, error, connection } = m

  // A pick is only valid while the server's active mission is the one it was made under,
  // so the panel follows the server when a mission is started from elsewhere.
  const [pick, setPick] = useState<{ id: string; under: string | null } | null>(null)
  const state = status?.state ?? 'idle'
  const running = state === 'running'
  const activeId = status?.mission_id ?? null
  const firstAvailable = (missions.find((x) => x.available) ?? missions[0])?.id ?? null
  const picked = pick && pick.under === activeId ? pick.id : null
  const selectedId = running ? activeId : (picked ?? activeId ?? firstAvailable)
  const selected = missions.find((x) => x.id === selectedId) ?? null
  const conn = CONNECTION[connection]

  return (
    <section
      className={[tokens.tokens, styles.root, className ?? ''].filter(Boolean).join(' ')}
      aria-label="Missions"
      data-projector={projector ? 'true' : undefined}
    >
      <Card padding="none">
        <header className={styles.head}>
          <h2 className={`label ${styles.heading}`}>Missions</h2>
          <span title={`Live feed: ${conn.label}`}>
            <Pill variant={conn.tone}>{conn.label}</Pill>
          </span>
        </header>

        <MissionList
          missions={missions}
          selectedId={selectedId}
          activeId={activeId}
          activeState={state}
          passedIds={passedIds}
          disabled={running}
          onSelect={(id) => setPick({ id, under: activeId })}
        />

        {selected && (
          <div className={styles.activeWrap}>
            <ActiveMission
              key={selected.id}
              entry={selected}
              status={status?.mission_id === selected.id ? status : null}
              fetchedAt={m.fetchedAt}
              busy={busy}
              canStart={selected.available && !running}
              onStart={() => void m.start(selected.id)}
              onStop={() => void m.stop()}
            />
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Card>
    </section>
  )
}

interface ActiveMissionProps {
  entry: MissionEntry
  status: MissionStatus | null
  fetchedAt: number
  busy: boolean
  canStart: boolean
  onStart: () => void
  onStop: () => void
}

function ActiveMission({ entry, status, fetchedAt, busy, canStart, onStart, onStop }: ActiveMissionProps) {
  const [hintOpen, setHintOpen] = useState(false)
  const secondsLeft = useSecondsLeft(status, fetchedAt)
  const state = status?.state ?? 'idle'
  const running = state === 'running'
  const urgent = running && secondsLeft != null && secondsLeft <= 10
  const duration = status?.duration_s ?? null
  const progress =
    running && duration && secondsLeft != null ? Math.min(1, Math.max(0, 1 - secondsLeft / duration)) : state === 'idle' ? 0 : 1
  const hints = status?.hints ?? []
  const feed = [...(status?.messages ?? [])].filter((msg) => msg.kind !== 'result').reverse()
  const stateLabel = STATE_LABEL[state]
  const hasHint = entry.available && Boolean(entry.hint) && entry.hint !== 'TODO'
  const clock = running ? formatClock(secondsLeft) : state === 'idle' ? formatClock(null) : '0:00'

  return (
    <Card raised padding="md" className={styles.mission}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          <div className={styles.meta}>
            <span className="label">Mission {entry.number}</span>
            <Pill variant={stateLabel.tone}>{stateLabel.label}</Pill>
          </div>
          <h3 className={styles.title}>{entry.title}</h3>
        </div>
        <div className={styles.clockBlock}>
          <span className="label" id={`clock-${entry.id}`}>
            Time left
          </span>
          <span
            className={`num ${styles.clock} ${urgent ? styles.urgent : ''}`}
            role="timer"
            aria-labelledby={`clock-${entry.id}`}
          >
            {clock}
          </span>
        </div>
      </div>

      <span className={tokens.srOnly} aria-live="polite" aria-atomic="true">
        {countdownAnnouncement(running, secondsLeft)}
      </span>

      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressBar} style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className={styles.goal}>
        <span className="label">Goal</span>
        <p>{status?.goal ?? entry.goal}</p>
      </div>

      <div className={styles.actions}>
        {running ? (
          <Button variant="ghost" onClick={onStop} disabled={busy}>
            Stop mission
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              setHintOpen(false)
              onStart()
            }}
            disabled={!canStart || busy}
          >
            {state === 'idle' ? 'Start mission' : 'Play again'}
          </Button>
        )}
        {hasHint && (
          <Button variant="ghost" onClick={() => setHintOpen((v) => !v)}>
            {hintOpen ? 'Hide hint' : 'Need a hint?'}
          </Button>
        )}
        {!entry.available && <span className={styles.locked}>Unlocks soon. The forecast is still being written.</span>}
      </div>

      {hintOpen && (
        <p className={styles.hintBox} role="note">
          <span className="label">Hint</span>
          <HelpTip label="Hint" text={HELP.hint} />
          <span className={styles.hintText}>{entry.hint}</span>
        </p>
      )}

      {hints.length > 0 && (
        <div className={styles.section}>
          <h4 className={`label ${styles.sectionHead}`}>Coach&apos;s tips</h4>
          <ul className={styles.tips} aria-live="polite">
            {hints.map((h, i) => (
              <li key={`${i}-${h}`}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {(running || feed.length > 0) && (
        <div className={styles.section}>
          <h4 className={`label ${styles.sectionHead}`}>Trading floor</h4>
          <ul className={styles.feed} aria-live="polite" aria-relevant="additions" aria-label="Mission feed">
            {feed.length === 0 && <li className={styles.feedEmpty}>Quiet on the floor. For now.</li>}
            {feed.map((msg) => (
              <FeedItem key={msg.seq} msg={msg} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
