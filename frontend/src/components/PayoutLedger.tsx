import { useEffect, useState } from 'react'
import { getPayouts, usePlayers, usePortfolio } from '../api'
import type { Payout } from '../api'
import { formatHOOP, formatQty } from '../utils/format'
import styles from './Season.module.css'

/** Every performance payment credited to the account, newest first. */
export default function PayoutLedger() {
  const [rows, setRows] = useState<Payout[]>([])
  const [error, setError] = useState('')
  const { bySymbol } = usePlayers()
  const { portfolio } = usePortfolio()
  const paid = portfolio?.payouts_received

  useEffect(() => {
    let alive = true
    getPayouts()
      .then((x) => {
        if (alive) {
          setRows(x)
          setError('')
        }
      })
      .catch(() => {
        if (alive) setError('Payout history is temporarily unavailable.')
      })
    return () => {
      alive = false
    }
  }, [paid])

  return (
    <section className={styles.ledger} data-tour="payout-ledger" aria-labelledby="payout-ledger-title">
      <h2 id="payout-ledger-title" className={styles.ledgerTitle}>Performance payments</h2>
      <p className={styles.muted}>Cash credited for shares held at the noon cutoff. Payments settle at day close.</p>
      {error ? (
        <p role="status">{error}</p>
      ) : rows.length === 0 ? (
        <p className={styles.muted}>No payments yet. Hold shares across a game's ownership cutoff to qualify.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Player</th>
                <th className={styles.right}>Shares held</th>
                <th className={styles.right}>Game Score</th>
                <th className={styles.right}>Cash paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={`${p.t}-${p.symbol}-${i}`}>
                  <td className="num">{new Date(p.t * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                  <td>{bySymbol.get(p.symbol)?.name ?? p.symbol}</td>
                  <td className={`num ${styles.right}`}>{formatQty(p.qty_held)}</td>
                  <td className={`num ${styles.right}`}>{p.game_score == null ? '—' : p.game_score.toFixed(1)}</td>
                  <td className={`num ${styles.right} trend-up`}>+{formatHOOP(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
