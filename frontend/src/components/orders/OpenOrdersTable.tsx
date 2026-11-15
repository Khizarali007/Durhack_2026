import { PlayerName } from '../PlayerIdentity'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cancelOrder, subscribeOrderUpdates, errorDetail, refreshAccount } from '../../api'
import type { OpenOrder } from '../../api'
import { formatClock, formatPrice, formatQty } from '../../utils/format'
import styles from './tables.module.css'

/** How long a filled or cancelled order stays on screen before it leaves the list. */
const CLOSED_LINGER_MS = 6000

function orderName(o: OpenOrder): string {
  if (o.type === 'stop') return 'Stop-loss'
  return o.side === 'buy' ? 'Limit buy' : 'Limit sell'
}

function trigger(o: OpenOrder): string {
  if (o.type === 'stop') return `if bid ≤ ${formatPrice(o.price)}`
  return o.side === 'buy' ? `when ask ≤ ${formatPrice(o.price)}` : `when bid ≥ ${formatPrice(o.price)}`
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface OpenOrdersTableProps {
  orders: OpenOrder[]
  /** Only show fill/cancel notices for this stock. */
  symbol?: string
  showSymbol?: boolean
  empty: ReactNode
}

/**
 * Open limit and stop orders with a cancel button. An order that fills, is
 * rejected or is cancelled while you are looking stays for a few seconds
 * with its outcome, so it never just vanishes.
 */
export default function OpenOrdersTable({ orders, symbol, showSymbol = false, empty }: OpenOrdersTableProps) {
  const [closed, setClosed] = useState<OpenOrder[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    const off = subscribeOrderUpdates(msg => {
      const o = msg.order
      if (o.status === 'open') return
      if (symbol !== undefined && o.symbol !== symbol) return
      setClosed(prev => [o, ...prev.filter(c => c.order_id !== o.order_id)])
      const timer = setTimeout(() => {
        pending.delete(timer)
        setClosed(prev => prev.filter(c => c.order_id !== o.order_id))
      }, CLOSED_LINGER_MS)
      pending.add(timer)
    })
    return () => {
      off()
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    }
  }, [symbol])

  async function cancel(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await cancelOrder(id)
    } catch (err) {
      setError(errorDetail(err, 'That order could not be cancelled.'))
      void refreshAccount()
    } finally {
      setBusyId(null)
    }
  }

  const openIds = new Set(orders.map(o => o.order_id))
  const rows = [...closed.filter(o => !openIds.has(o.order_id)), ...orders]

  if (rows.length === 0) return <div className={styles.empty}>{empty}</div>

  return (
    <>
      {error !== null && <p className={styles.error} role="alert">⚠ {error}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.left} scope="col">Order</th>
            {showSymbol && <th className={styles.left} scope="col">Player</th>}
            <th scope="col">Shares</th>
            <th scope="col">Price</th>
            <th className={styles.left} scope="col">Fills</th>
            <th scope="col">Placed</th>
            <th scope="col"><span className="sr-only">Status</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => {
            const isOpen = o.status === 'open'
            return (
              <tr key={o.order_id} className={isOpen ? undefined : styles.closedRow}>
                <td className={styles.left}>
                  <span className={`${styles.tag} ${o.type === 'stop' ? styles.tagWarn : o.side === 'buy' ? styles.tagUp : styles.tagDown}`}>
                    {o.type === 'stop' ? '🛡' : o.side === 'buy' ? '▲' : '▼'} {orderName(o)}
                  </span>
                </td>
                {showSymbol && (
                  <td className={styles.left}>
                    <Link to={`/stock/${o.symbol}`} className={styles.link}><span className={styles.whoName}><PlayerName symbol={o.symbol}/></span></Link>
                  </td>
                )}
                <td>{o.filled_qty > 0 ? `${formatQty(o.filled_qty)} / ${formatQty(o.qty)}` : formatQty(o.qty)}</td>
                <td>{formatPrice(o.price)}</td>
                <td className={`${styles.left} ${styles.muted}`}>{trigger(o)}</td>
                <td className={styles.muted}>{formatClock(o.created_t)}</td>
                <td>
                  {isOpen ? (
                    <button
                      type="button"
                      className={styles.cancel}
                      disabled={busyId === o.order_id}
                      onClick={() => void cancel(o.order_id)}
                    >
                      {busyId === o.order_id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : o.status === 'filled' ? (
                    <span className={`${styles.tag} ${styles.tagUp}`} title={o.reason ? sentence(o.reason) : undefined}>✓ Filled</span>
                  ) : o.status === 'cancelled' ? (
                    <span className={`${styles.tag} ${styles.tagNeutral}`}>✕ Cancelled</span>
                  ) : (
                    <span className={`${styles.tag} ${styles.tagDown}`} title={o.reason ? sentence(o.reason) : undefined}>
                      ⚠ Rejected{o.reason ? `: ${o.reason}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
