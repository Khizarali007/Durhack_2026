import styles from './ScoreRing.module.css'

export interface ScoreRingProps {
  /** 0-100 */
  score: number
  passed: boolean
}

const R = 30
const C = 2 * Math.PI * R

/** Compact 0-100 ring. Green when passed, red when not. */
export function ScoreRing({ score, passed }: ScoreRingProps) {
  const s = Math.round(Math.max(0, Math.min(100, score || 0)))
  return (
    <div className={`${styles.ring} ${passed ? styles.pass : styles.fail}`} role="img" aria-label={`Score ${s} out of 100`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className={styles.track} cx="36" cy="36" r={R} />
        <circle
          className={styles.fill}
          cx="36"
          cy="36"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - s / 100)}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className={`num ${styles.value}`} aria-hidden="true">
        {s}
      </span>
    </div>
  )
}
