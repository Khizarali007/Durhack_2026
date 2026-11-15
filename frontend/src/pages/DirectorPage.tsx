import { useState } from 'react'
import { Link } from 'react-router-dom'
import { jumpToWembyStorm } from '../api'
import '../components/season.css'

/** Demo controls for presenters, in Jonathan's overview style. Works against the real season replay. */
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
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Demo controls</h1>
        <span className="quiet-label">For presenters</span>
      </header>

      <section className="season-review" aria-label="Injury demo">
        <div className="panel-heading">
          <h2>Injury demo: Victor Wembanyama, February 2025</h2>
        </div>
        <ol className="fine-print">
          <li>Jump to 19 Feb 2025. The season pauses there and portfolios are kept (about 50 seconds).</li>
          <li>
            Buy a few <Link to="/stock/WEMBY">Victor Wembanyama</Link> shares. No injury news yet.
          </li>
          <li>
            Open <b>Replay settings</b> in the season bar and press <b>Next day</b> (or press <b>Play season</b> and wait
            about a minute). The official report lists him doubtful: an injury warning.
          </li>
          <li>One more day: he is ruled out and the price drops. Anyone who sold on the warning avoided it.</li>
          <li>
            Then open <Link to="/activity">Activity</Link> for your review, and <Link to="/friends">Friends</Link> to see
            how the rivals handled it.
          </li>
        </ol>
        <button className="season-primary" type="button" onClick={() => void storm()} disabled={busy}>
          {busy ? 'Jumping…' : 'Jump to 19 Feb 2025'}
        </button>
        {message && <p className="quiet-label" role="status">{message}</p>}
      </section>

      <p className="fine-print">Injury news is the real status from the NBA's official report; medical details are never shown.</p>
    </div>
  )
}
