import { useWhistleLine } from '../../api'
import { formatClock, formatPct, trendArrow } from '../../utils/format'
import styles from './WhistleStrip.module.css'

interface WhistleStripProps {
  symbol: string
}

/**
 * This player's line from the latest final whistle that named them. The strip
 * is always there, so the chart does not jump when a whistle lands.
 */
export default function WhistleStrip({ symbol }: WhistleStripProps) {
  const entry = useWhistleLine(symbol)

  return (
    <div className={styles.strip} aria-live="polite">
      <span className={styles.label}><span aria-hidden="true">🏁</span> Final whistle</span>
      {entry === null ? (
        <span className={styles.none}>No box score for this player yet. One lands every 12 market minutes.</span>
      ) : (
        <>
          <span className={styles.time}>{formatClock(entry.t)}</span>
          <span className={styles.line}>{entry.line.headline}</span>
          <span className={entry.line.impact >= 0 ? 'trend-up' : 'trend-down'}>
            {trendArrow(entry.line.impact)} fair value {formatPct(entry.line.impact * 100)}
          </span>
        </>
      )}
    </div>
  )
}
