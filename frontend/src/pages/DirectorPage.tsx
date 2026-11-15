import { useState } from 'react'
import { Link } from 'react-router-dom'
import { jumpToWembyStorm } from '../api'
import { Button, Card } from '../components/ui'
import styles from './DirectorPage.module.css'

/** Demo controls for presenters. Works against the real season replay. */
export default function DirectorPage() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function storm() {
    setBusy(true)
    const result = await jumpToWembyStorm()
    setMessage(result.detail ?? (result.ok ? 'Done.' : 'That did not work.'))
    setBusy(false)
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Replay controls</h1>
        <p className={styles.muted}>
          Use the season bar above to move the market. Every simulated day processes trades and payouts. Rewinding
          restarts every portfolio; accounts are kept.
        </p>
      </header>

      <Card padding="lg" className={styles.card}>
        <h2 className={styles.cardTitle}>Storm demo: Wembanyama, February 2025</h2>
        <ol className={styles.steps}>
          <li>Jump to 19 Feb 2025 (forward jumps keep portfolios; it takes about 50 seconds).</li>
          <li>
            Buy a few <Link to="/stock/WEMBY">WEMBY</Link> shares. The Storm Radar is calm.
          </li>
          <li>
            Press <b>Next day</b>: the official report lists him doubtful. Early warning, radar turns cloudy.
          </li>
          <li>
            Press <b>Next day</b> again: he is ruled out. Storm, and the price falls. Anyone who sold on the warning
            stayed dry.
          </li>
          <li>
            Open <Link to="/activity">Activity</Link> for the review card, and <Link to="/friends">Friends</Link> to see
            how the rivals handled it.
          </li>
        </ol>
        <div>
          <Button variant="primary" onClick={() => void storm()} disabled={busy}>
            {busy ? 'Jumping…' : 'Jump to 19 Feb 2025'}
          </Button>
        </div>
        {message && <p className={styles.status} role="status">{message}</p>}
      </Card>

      <p className={styles.muted}>
        Every injury headline is the real status from the NBA's official report; medical details are never shown.
      </p>
    </div>
  )
}
