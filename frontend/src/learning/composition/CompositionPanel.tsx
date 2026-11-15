import { Link } from 'react-router-dom'
import { useComposition } from '../../api'
import type { CompositionGrade, CompositionSlice } from '../../api'
import { formatHOOP } from '../../utils/format'
import { HelpTip } from '../HelpTip'
import styles from './Composition.module.css'

const SHOWN = 6

/** Top slices plus one "Everything else" row, so the list never becomes a wall. */
function topSlices(slices: CompositionSlice[]): CompositionSlice[] {
  if (slices.length <= SHOWN + 1) return slices
  const rest = slices.slice(SHOWN)
  return [
    ...slices.slice(0, SHOWN),
    {
      key: '_rest',
      label: `${rest.length} others`,
      value: rest.reduce((s, r) => s + r.value, 0),
      pct: Math.round(rest.reduce((s, r) => s + r.pct, 0) * 10) / 10,
    },
  ]
}

function gradeTone(grade: CompositionGrade | null): string {
  if (grade === 'A' || grade === 'B') return styles.good
  if (grade === 'C') return styles.ok
  if (grade === 'D' || grade === 'F') return styles.bad
  return styles.none
}

function Bars({ title, slices }: { title: string; slices: CompositionSlice[] }) {
  return (
    <div className={styles.bars}>
      <h3 className={`label ${styles.barsTitle}`}>{title}</h3>
      <ul className={styles.barList}>
        {topSlices(slices).map((s) => (
          <li key={s.key} className={styles.barRow}>
            <span className={styles.barLabel} title={s.label}>{s.label}</span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={styles.barFill} style={{ transform: `scaleX(${Math.min(1, s.pct / 100)})` }} />
            </span>
            <span className={`num ${styles.barPct}`}>{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Portfolio Composition: what's in your basket, how balanced it is, and an A–F grade. */
export function CompositionPanel() {
  const { composition: c, unavailable } = useComposition()

  return (
    <div className={styles.panel} id="composition" data-tour="composition">
      <div className={styles.head}>
        <h2 className={styles.title}>
          Invested-holdings diversification
          <HelpTip
            label="Composition grade"
            text="How evenly your invested holdings are spread across players and teams. Cash is excluded. This is not a performance or overall risk grade."
          />
        </h2>
        {c && c.grade && <span className={styles.sub}>{c.holdings} players · {c.teams} teams</span>}
      </div>

      {c === null ? (
        <p className={styles.muted}>
          {unavailable ? 'Composition needs the live backend (it is not available in mock mode).' : 'Reading your basket…'}
        </p>
      ) : (
        <>
          <div className={styles.summary}>
            <span className={`${styles.grade} ${gradeTone(c.grade)}`} aria-label={c.grade ? `Grade ${c.grade}` : 'No grade yet'}>
              {c.grade ?? '–'}
            </span>
            <p className={styles.reason}>{c.reason}</p>
          </div>

          {c.grade && (
            <>
              <dl className={styles.stats}>
                <div>
                  <dt className="label">
                    Effective holdings
                    <HelpTip label="Effective holdings" text="How many equal-sized positions your basket behaves like. Ten players with one huge position can act like two." />
                  </dt>
                  <dd className="num">{c.effective_holdings.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="label">Biggest player</dt>
                  <dd className="num">{c.top_player_pct.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="label">Biggest team</dt>
                  <dd className="num">{c.top_team_pct.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="label">Invested</dt>
                  <dd className="num">{formatHOOP(c.invested, 0)}</dd>
                </div>
                <div>
                  <dt className="label">Cash</dt>
                  <dd className="num">{c.cash_pct.toFixed(0)}%</dd>
                </div>
              </dl>
              <div className={styles.split}>
                <Bars title="By team" slices={c.by_team} />
                <Bars title="By player" slices={c.by_player} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Compact grade for the account strip: letter plus a short line, links to the full panel. */
export function CompositionGradeChip() {
  const { composition: c } = useComposition()
  if (c === null) return null
  return (
    <Link className={styles.chip} to="/portfolio#composition" aria-label={c.grade ? `Composition grade ${c.grade}` : 'Composition: no grade yet'}>
      <span className={`${styles.chipGrade} ${gradeTone(c.grade)}`}>{c.grade ?? '–'}</span>
      <span className={styles.chipText}>{c.grade ? `${c.holdings} players · ${c.teams} teams` : 'All cash'}</span>
    </Link>
  )
}
