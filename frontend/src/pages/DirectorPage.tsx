import { useState } from 'react'
import { Link } from 'react-router-dom'
import { playScenario, resetMarket, DIRECTOR_AVAILABLE } from '../api'
import type { DirectorResult } from '../api'
import { Button } from '../components/ui'
import styles from './DirectorPage.module.css'

/** Demo controls for the stage. Not in the nav: open /director directly. */
export default function DirectorPage() {
  const [result, setResult] = useState<DirectorResult | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<DirectorResult>) {
    setBusy(true)
    try { setResult(await action()) }
    finally { setBusy(false) }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Director</h1>
      <p className={styles.note}>
        {DIRECTOR_AVAILABLE
          ? 'Mock market only. These buttons drive the in-browser mock until Person 1 exposes a director API.'
          : 'Not available: the real backend has no director API yet, so these buttons do nothing.'}
      </p>

      <section className={styles.card}>
        <h2>Wembanyama storm</h2>
        <p>
          Early warning now (radar goes cloudy), a worse warning after 3 market minutes (15 seconds),
          then he is ruled out at 6 market minutes (30 seconds) and the price gaps down about 18%.
        </p>
        <div className={styles.actions}>
          <Button size="lg" disabled={busy || !DIRECTOR_AVAILABLE} onClick={() => void run(() => playScenario('wemby_storm'))}>
            ⛈ Play Wembanyama storm
          </Button>
          <Link to="/stock/WEMBY" className={styles.link}>Open WEMBY chart →</Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Reset</h2>
        <p>Rewinds the market to the opening bell. Use this between demo runs.</p>
        <div className={styles.actions}>
          <Button variant="ghost" disabled={busy || !DIRECTOR_AVAILABLE} onClick={() => void run(() => resetMarket())}>
            Reset market
          </Button>
          <Button variant="ghost" disabled={busy || !DIRECTOR_AVAILABLE} onClick={() => void run(() => resetMarket({ account: true }))}>
            Reset market and my account (back to 100,000 HOOP)
          </Button>
        </div>
      </section>

      <div className={styles.result} role="status" aria-live="polite">
        {result !== null && (
          <span className={result.ok ? 'trend-up' : 'trend-down'}>
            {result.ok ? '✓' : '⚠'} {result.detail}
          </span>
        )}
      </div>
    </div>
  )
}
