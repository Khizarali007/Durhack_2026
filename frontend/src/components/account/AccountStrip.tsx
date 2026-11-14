import { usePortfolio, useReservedCash } from '../../api'
import { formatHOOP, formatPct, formatPnl, trendArrow } from '../../utils/format'
import styles from './AccountStrip.module.css'

/** Cash, equity and profit at a glance. Shared by Home and Portfolio. */
export default function AccountStrip() {
  const { portfolio, loading } = usePortfolio()
  const reserved = useReservedCash()

  if (portfolio === null) {
    return (
      <div className={styles.strip} aria-busy={loading}>
        {Array.from({ length: 4 }, (_, i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)}
      </div>
    )
  }

  const pnl = portfolio.total_pnl
  const trend = pnl > 0 ? 'trend-up' : pnl < 0 ? 'trend-down' : 'trend-flat'

  return (
    <dl className={styles.strip}>
      <div className={styles.stat}>
        <dt>Equity</dt>
        <dd className={styles.big}>{formatHOOP(portfolio.equity)} <span className={styles.unit}>HOOP</span></dd>
        <span className={styles.sub}>cash plus what your shares are worth</span>
      </div>
      <div className={styles.stat}>
        <dt>Cash</dt>
        <dd>{formatHOOP(portfolio.cash)}</dd>
        <span className={styles.sub}>{formatHOOP(reserved)} tied up in pending orders</span>
      </div>
      <div className={styles.stat}>
        <dt>Shares worth</dt>
        <dd>{formatHOOP(portfolio.positions_value)}</dd>
        <span className={styles.sub}>{portfolio.positions.length} {portfolio.positions.length === 1 ? 'holding' : 'holdings'}</span>
      </div>
      <div className={styles.stat}>
        <dt>Profit / loss</dt>
        <dd className={trend}>{trendArrow(pnl)} {formatPnl(pnl)}</dd>
        <span className={`${styles.sub} ${trend}`}>{formatPct(portfolio.total_pnl_pct, 2)} since you started with {formatHOOP(portfolio.starting_cash, 0)}</span>
      </div>
    </dl>
  )
}
