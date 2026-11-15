import { useState } from 'react'
import { Link } from 'react-router-dom'
import { jumpToWembyStorm } from '../api'

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
    <div style={{ padding: 24, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Replay controls</h1>
      <p>Use the season bar above to move the market. Every simulated day processes trades and payouts. Rewinding resets all accounts.</p>
      <section aria-labelledby="storm-demo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 id="storm-demo" style={{ margin: 0 }}>Storm demo: Wembanyama, February 2025</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Jump to 19 Feb 2025 (forward jumps keep accounts; it takes about a minute).</li>
          <li>Buy a few <Link to="/stock/WEMBY">WEMBY</Link> shares. The radar is calm.</li>
          <li>Press <b>Next day</b>: the official report lists him doubtful. Early warning, radar turns cloudy.</li>
          <li>Press <b>Next day</b> again: he is ruled out. Storm, and the price falls. Those who sold on the warning stayed dry.</li>
        </ol>
        <div><button type="button" disabled={busy} onClick={() => void storm()}>{busy ? 'Jumping…' : 'Jump to 19 Feb 2025'}</button></div>
        {message && <p role="status">{message}</p>}
      </section>
      <p><small>Every injury headline is the real status from the NBA's official report; medical details are never shown.</small></p>
    </div>
  )
}
