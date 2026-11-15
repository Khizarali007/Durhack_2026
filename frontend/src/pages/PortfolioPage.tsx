import PayoutLedger from '../components/PayoutLedger'
import { CompositionPanel } from '../learning'
import { Link } from 'react-router-dom'
import { usePortfolio } from '../api'
import AccountStrip from '../components/account/AccountStrip'
import HoldingsTable from '../components/account/HoldingsTable'
import styles from './PortfolioPage.module.css'

/** Your account: cash, equity, profit, and every holding updating live. */
export default function PortfolioPage() {
  const { portfolio, loading } = usePortfolio()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Portfolio</h1>

      </header>

      <AccountStrip />

      <section className={styles.panel} aria-label="Holdings" data-tour="portfolio-holdings">
        <h2 className={styles.panelTitle}>Holdings</h2>
        {portfolio === null ? (
          <div className={styles.skeletons} aria-busy={loading}>
            {Array.from({ length: 4 }, (_, i) => <div key={i} className={`skeleton ${styles.skeletonRow}`} />)}
          </div>
        ) : portfolio.positions.length === 0 ? (
          <div className={styles.empty}>

            <h3>No holdings</h3>
            <p>H${portfolio.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })} available.</p>
            <Link to="/market" className={styles.cta}>Find a player</Link>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <HoldingsTable positions={portfolio.positions} equity={portfolio.equity} />
          </div>
        )}
      </section>

      {/* Person 4's Composition panel (% by team / player, grade A–F) */}
      <details id="composition-panel-mount" aria-label="Composition"><summary>Portfolio diversification</summary>
        <CompositionPanel />
      </details>

      <PayoutLedger />
    </div>
  )
}
