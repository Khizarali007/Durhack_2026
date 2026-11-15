import { useSeason } from '../../api/useSeason'
import { usePortfolio, useReservedCash } from '../../api'
import { formatHOOP, formatPct, formatPnl, trendArrow } from '../../utils/format'
import { CompositionGradeChip } from '../../learning'
import styles from './AccountStrip.module.css'

/** Cash, equity and profit at a glance. Shared by Home and Portfolio. */
export default function AccountStrip() {
  const { portfolio, loading } = usePortfolio()
  const reserved = useReservedCash()
  const {score} = useSeason()

  if (portfolio === null) {
    return (
      <div className={styles.strip} aria-busy={loading}>
        {Array.from({ length: 4 }, (_, i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)}
      </div>
    )
  }

  const pnl = score ? score.score-score.starting_cash : 0
  const trend = pnl > 0 ? 'trend-up' : pnl < 0 ? 'trend-down' : 'trend-flat'

  return (
    <dl className={styles.strip}>
      <div className={styles.stat}>
        <dt>Season score</dt>
        <dd className={styles.big}>{score ? formatHOOP(score.score) : '—'}</dd>
        <span className={styles.sub}>estimated exit value after costs</span>
      </div>
      <div className={styles.stat}>
        <dt>Cash</dt>
        <dd>{formatHOOP(portfolio.cash)}</dd>
        <span className={styles.sub}>{formatHOOP(reserved)} tied up in pending orders</span>
      </div>
      <div className={styles.stat}>
        <dt>Quoted holdings</dt>
        <dd>{formatHOOP(portfolio.positions_value)}</dd>
        <span className={styles.sub}>{portfolio.positions.length} {portfolio.positions.length === 1 ? 'holding' : 'holdings'}</span>
      </div>
      <div className={styles.stat}>
        <dt>Season return</dt>
        <dd className={trend}>{score ? `${trendArrow(pnl)} ${formatPnl(pnl)}` : '—'}</dd>
        <span className={`${styles.sub} ${trend}`}>{score ? formatPct(score.return_pct, 2) : '—'} since you started with {formatHOOP(portfolio.starting_cash, 0)}</span>
      </div>
      <div className={styles.stat}>
        <dt>Diversification</dt>
        <dd><CompositionGradeChip /></dd>
        <span className={styles.sub}>invested holdings only; excludes cash</span>
      </div>
    </dl>
  )
}
