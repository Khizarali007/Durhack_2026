import type { MissionEntry, MissionState } from '../../api/learning'
import { Pill } from '../ui'
import type { PillTone } from './missionCopy'
import tokens from './tokens.module.css'
import styles from './MissionList.module.css'

export interface MissionListProps {
  missions: MissionEntry[]
  selectedId: string | null
  activeId?: string | null
  activeState?: MissionState
  passedIds?: ReadonlySet<string>
  /** While a mission runs, every other row is disabled. */
  disabled?: boolean
  onSelect: (missionId: string) => void
}

function chipFor(locked: boolean, passed: boolean, live: boolean): { label: string; tone: PillTone } {
  if (live) return { label: 'Live', tone: 'accent' }
  if (passed) return { label: 'Passed', tone: 'up' }
  if (locked) return { label: 'Locked', tone: 'neutral' }
  return { label: 'Ready', tone: 'neutral' }
}

export function MissionList({
  missions,
  selectedId,
  activeId,
  activeState,
  passedIds,
  disabled = false,
  onSelect,
}: MissionListProps) {
  if (!missions.length) return <p className={`${tokens.tokens} ${styles.empty}`}>Loading missions…</p>
  return (
    <ol className={`${tokens.tokens} ${styles.list}`}>
      {missions.map((x) => {
        const locked = !x.available
        const passed = passedIds?.has(x.id) ?? false
        const live = x.id === activeId && activeState === 'running'
        const selected = x.id === selectedId
        const chip = chipFor(locked, passed, live)
        const cls = [styles.row, selected ? styles.selected : '', locked ? styles.locked : '']
          .filter(Boolean)
          .join(' ')
        return (
          <li key={x.id}>
            <button
              type="button"
              className={cls}
              disabled={locked || (disabled && x.id !== activeId)}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(x.id)}
            >
              <span className={`num ${styles.number}`} aria-hidden="true">
                {x.number}
              </span>
              <span className={styles.title}>
                <span className={tokens.srOnly}>Mission {x.number}: </span>
                {x.title}
              </span>
              <Pill variant={chip.tone}>{chip.label}</Pill>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
