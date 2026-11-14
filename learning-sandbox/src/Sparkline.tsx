import styles from './Sparkline.module.css'

export interface SparklineProps {
  prices: number[]
}

const W = 300
const H = 72

export function Sparkline({ prices }: SparklineProps) {
  if (prices.length < 2) return <div className={styles.empty}>Waiting for ticks…</div>
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const span = hi - lo || 1
  const pts = prices.map((p, i) => [(i / (prices.length - 1)) * W, H - 4 - ((p - lo) / span) * (H - 8)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const up = prices[prices.length - 1] >= prices[0]
  return (
    <svg
      className={`${styles.spark} ${up ? styles.up : styles.down}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price over the last minute, ${up ? 'up' : 'down'}`}
    >
      <path className={styles.area} d={`${line} L${W},${H} L0,${H} Z`} />
      <path className={styles.line} d={line} />
    </svg>
  )
}
