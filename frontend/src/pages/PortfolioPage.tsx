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
        <p className={styles.lede}>Everything you own, priced live. Click a player to trade them.</p>
      </header>

      <AccountStrip />

      <section className={styles.panel} aria-label="Holdings">
        <h2 className={styles.panelTitle}>Holdings</h2>
        {portfolio === null ? (
          <div className={styles.skeletons} aria-busy={loading}>
            {Array.from({ length: 4 }, (_, i) => <div key={i} className={`skeleton ${styles.skeletonRow}`} />)}
          </div>
        ) : portfolio.positions.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">⛅</span>
            <h3>Nothing here yet: clear skies, zero exposure</h3>
            <p>You have {portfolio.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })} HOOP to play with. Pick a player who is moving and buy your first 10 shares.</p>
            <Link to="/" className={styles.cta}>See today's top movers</Link>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <HoldingsTable positions={portfolio.positions} equity={portfolio.equity} />
          </div>
        )}
      </section>

      {/* Mount point for Person 4's Composition panel (% by team / player, grade A–F) */}
      <section id="composition-panel-mount" className={styles.mount} aria-label="Composition">
        Composition panel (Person 4) mounts here.
      </section>
    </div>
  )
}
