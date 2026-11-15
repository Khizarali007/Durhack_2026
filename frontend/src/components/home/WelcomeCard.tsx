import { useMemo, useState } from 'react'
import { errorDetail, placeOrder, useOrderQuote, usePlayers, usePortfolio, useSession, useTrades } from '../../api'
import { tour } from '../../learning/tour/store'
import { formatHOOP } from '../../utils/format'
import { Button, Card, Input } from '../ui'
import styles from './WelcomeCard.module.css'

const DISMISS_KEY = 'hs-welcome-dismissed:'

function readDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY + userId) === '1'
  } catch {
    return false
  }
}

/** The old first-purchase screen, restyled and optional: pick a player, see the cost, buy. */
function QuickBuy({ onBought }: { onBought: (message: string) => void }) {
  const { players } = usePlayers()
  const [symbol, setSymbol] = useState('JOKIC')
  const [qty, setQty] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const estimate = useOrderQuote(symbol, 'buy', qty)
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name)), [players])

  async function buy() {
    setBusy(true)
    setError('')
    try {
      await placeOrder({ symbol, side: 'buy', qty })
      onBought(`Bought ${qty} ${symbol}. Press Next day in the season bar to see game payouts arrive.`)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.quick}>
      <label className={styles.field}>
        <span className="label">Player</span>
        <select className={styles.select} value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="First player">
          {sorted.map((p) => (
            <option key={p.symbol} value={p.symbol}>
              {p.name} · {p.team}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.qty}>
        <Input
          label="Shares"
          type="number"
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(10_000, Math.trunc(Number(e.target.value) || 1))))}
        />
      </div>
      <div className={styles.cost}>
        <span className="label">Estimated cost</span>
        <span className={`num ${styles.costValue}`}>{estimate.quote ? formatHOOP(estimate.quote.total) : '—'}</span>
        <span className={styles.muted}>fees included</span>
      </div>
      <Button
        variant="buy"
        size="lg"
        onClick={() => void buy()}
        disabled={busy || !estimate.quote || estimate.quote.cash_short}
      >
        {busy ? 'Buying…' : `Buy ${qty} ${symbol}`}
      </Button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}

/** Optional welcome for brand-new players on Home: two sentences, the tour, and a quick first buy. */
export default function WelcomeCard() {
  const { session } = useSession()
  const { portfolio } = usePortfolio()
  const trades = useTrades()
  const userId = session?.user_id ?? ''
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const [bought, setBought] = useState<{ user: string; message: string } | null>(null)

  const isNew = portfolio !== null && portfolio.positions.length === 0 && trades.length === 0
  const justBought = bought !== null && bought.user === userId
  if (!userId || dismissedFor === userId || readDismissed(userId)) return null
  if (!isNew && !justBought) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY + userId, '1')
    } catch {
      // Private mode: hiding it for this visit is enough.
    }
    setDismissedFor(userId)
  }

  return (
    <Card raised padding="lg" className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>Welcome to HoopStreet</h2>
        <button type="button" className={styles.close} aria-label="Dismiss welcome" onClick={dismiss}>
          ×
        </button>
      </div>
      <p className={styles.text}>
        Every NBA player is a share you can buy with H$100,000 of play money. Replay the 2024–25 season day by day: good
        games pay you, injuries move prices, and you learn to invest by doing.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => tour.start('welcome')}>Take the 2-minute tour</Button>
        <Button variant="ghost" onClick={() => setBuying((b) => !b)}>
          {buying ? 'Hide quick buy' : 'Make your first investment'}
        </Button>
      </div>
      {justBought ? (
        <p className={styles.done} role="status">{bought.message}</p>
      ) : (
        buying && <QuickBuy onBought={(message) => setBought({ user: userId, message })} />
      )}
    </Card>
  )
}
