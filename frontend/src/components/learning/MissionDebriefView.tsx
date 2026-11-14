import type { MissionEntry, MissionResult } from '../../api/learning'
import { Button, Card, Pill } from '../ui'
import { HelpTip } from './HelpTip'
import { ScoreRing } from './ScoreRing'
import { formatHoop, formatPct, formatPrice } from './format'
import { HELP, headlineFor, tradeSummary } from './missionCopy'
import tokens from './tokens.module.css'
import styles from './MissionDebriefView.module.css'

export interface MissionDebriefViewProps {
  /** Body of GET /learning/missions/result. */
  result: MissionResult
  entry?: MissionEntry | null
  nextMission?: MissionEntry | null
  busy?: boolean
  onRetry?: () => void
  onNext?: () => void
  onClose?: () => void
  projector?: boolean
  className?: string
}

/** Pure debrief view for one result. */
export function MissionDebriefView({
  result,
  entry,
  nextMission,
  busy = false,
  onRetry,
  onNext,
  onClose,
  projector,
  className,
}: MissionDebriefViewProps) {
  const head = headlineFor(result)
  const pnl = result.realised_pnl || 0
  const sold = result.qty_sold > 0

  return (
    <section
      className={[tokens.tokens, styles.root, className ?? ''].filter(Boolean).join(' ')}
      aria-label="Mission debrief"
      data-projector={projector ? 'true' : undefined}
    >
      <Card raised padding="none" className={`${styles.card} ${result.passed ? styles.pass : styles.fail}`}>
        <header className={styles.head}>
          <span className="label">
            Debrief · Mission {result.mission_number}
            {entry ? `: ${entry.title}` : ''}
          </span>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <span aria-hidden="true">×</span>
              <span className={tokens.srOnly}>Close debrief</span>
            </Button>
          )}
        </header>

        <div className={styles.body}>
          <div className={styles.verdictRow}>
            <ScoreRing score={result.score} passed={result.passed} />
            <div className={styles.verdict}>
              <Pill variant={result.passed ? 'up' : 'down'}>{result.passed ? 'Passed' : 'Not passed'}</Pill>
              <h3 className={styles.title} aria-live="polite">
                {head.title}
              </h3>
              <p className={styles.sub}>
                {result.state === 'stopped' ? 'Mission stopped early. ' : ''}
                {head.sub}
              </p>
            </div>
          </div>

          <dl className={styles.stats}>
            <div>
              <dt className="label">
                Score <HelpTip label="Score" text={HELP.score} />
              </dt>
              <dd className="num">
                {Math.round(result.score)}
                <span className={styles.unit}>/100</span>
              </dd>
            </div>
            <div>
              <dt className="label">
                Realised P&amp;L <HelpTip label="Realised profit" text={HELP.realised} />
              </dt>
              <dd className="num">
                {sold ? (
                  <Pill variant={pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'neutral'}>{formatHoop(pnl)}</Pill>
                ) : (
                  '-'
                )}
              </dd>
            </div>
            <div>
              <dt className="label">You bought / sold</dt>
              <dd className="num">
                {formatPrice(result.entry_price)} <span className={styles.arrow}>→</span> {formatPrice(result.exit_price)}
              </dd>
            </div>
            <div>
              <dt className="label">
                Best possible <HelpTip label="Best possible" text={HELP.best} />
              </dt>
              <dd className="num">
                {formatPrice(result.best_entry_price)} <span className={styles.arrow}>→</span>{' '}
                {formatPrice(result.best_exit_price)}
              </dd>
            </div>
            {sold && result.return_pct != null && (
              <div>
                <dt className="label">Return</dt>
                <dd className={`num ${pnl >= 0 ? styles.up : styles.down}`}>{formatPct(result.return_pct)}</dd>
              </div>
            )}
          </dl>

          <p className={styles.summary}>{tradeSummary(result)}</p>
          {result.debrief && <p className={styles.debrief}>{result.debrief}</p>}

          {result.lesson && (
            <aside className={styles.lesson}>
              <span className="label">Today&apos;s forecast</span>
              <p>{result.lesson}</p>
            </aside>
          )}

          <div className={styles.actions}>
            <Button variant="primary" onClick={onRetry} disabled={busy || !onRetry}>
              Retry
            </Button>
            <Button variant="ghost" onClick={onNext} disabled={busy || !onNext || !nextMission}>
              {nextMission ? `Next: ${nextMission.title}` : 'Next mission coming soon'}
            </Button>
          </div>
        </div>
      </Card>
    </section>
  )
}
