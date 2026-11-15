import { TourPromptCard } from '../learning/learn/TourPromptCard'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers } from '../api'
import type { Player } from '../api'
import AccountStrip from '../components/account/AccountStrip'
import MoverTile from '../components/home/MoverTile'
import { changePct } from '../components/home/moverChange'
import styles from './HomePage.module.css'

const SHOW = 5

/** `_tick` only exists so the ranking can be redone while the roster is unchanged. */
interface Mover { p: Player; pct: number }

function rankMovers(players: Player[], _tick: number): { gainers: Mover[]; losers: Mover[] } {
  void _tick
  const scored = players
    .map(p => ({ p, pct: changePct(p) }))
    .filter((x): x is Mover => x.pct !== null)
    .sort((a, b) => b.pct - a.pct)
  return {
    gainers: scored.slice(0, SHOW),
    losers: scored.slice(-SHOW).reverse(),
  }
}

/** The landing screen: your account, and the ten players moving most right now. */
export default function HomePage() {
  const { players, loading } = usePlayers()
  const [tick, setTick] = useState(0)

  // Re-rank once a second. Prices inside each card still tick twice a second.
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { gainers, losers } = useMemo(() => rankMovers(players, tick), [players, tick])
  const waiting = loading || gainers.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>Top movers</h1>
        <p className={styles.note}>Change since the opening price, re-ranked every second</p>
        <p className={styles.lede}>
          HoopStreet is a practice stock market where every NBA player is a share. You start with
          H$100,000 in virtual cash. Buy future performance, earn game payouts, and grow your portfolio through the 2024–25 season. No real money.
        </p>
      </header>

      <AccountStrip />

      <div className={styles.columns} data-tour="home-movers">
        <section className={styles.column} aria-label="Top gainers">
          <h2 className={styles.colTitle}><span className="trend-up" aria-hidden="true">▲</span> Biggest gainers</h2>
          {waiting
            ? Array.from({ length: SHOW }, (_, i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)
            : gainers.map((m, i) => <MoverTile key={m.p.symbol} player={m.p} pct={m.pct} rank={i + 1} />)}
        </section>
        <section className={styles.column} aria-label="Top losers">
          <h2 className={styles.colTitle}><span className="trend-down" aria-hidden="true">▼</span> Biggest fallers</h2>
          {waiting
            ? Array.from({ length: SHOW }, (_, i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)
            : losers.map((m, i) => <MoverTile key={m.p.symbol} player={m.p} pct={m.pct} rank={i + 1} />)}
        </section>
      </div>

      <div className={styles.footer}>
        <Link to="/market" className={styles.link}>Browse all {players.length} players →</Link>

        {/* Mount point for Person 4's mission prompt card ("Mission 1: Buy low, sell high") */}
        <section id="mission-card-mount" className={styles.mount} aria-label="Mission">
          <TourPromptCard />
        </section>
      </div>
    </div>
  )
}
