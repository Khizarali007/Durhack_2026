import { PlayerName } from '../PlayerIdentity'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { OrderSide, FillReason, Trade } from '../../api'
import { formatClock, formatHOOP, formatPnl, formatPrice, formatQty, formatSeconds, trendArrow } from '../../utils/format'
import styles from './tables.module.css'

const SIDE: Record<OrderSide, { label: string; icon: string; tag: string }> = {
  buy:   { label: 'Buy',   icon: '▲', tag: styles.tagUp },
  sell:  { label: 'Sell',  icon: '▼', tag: styles.tagDown },
  short: { label: 'Short', icon: '⤓', tag: styles.tagWarn },
  cover: { label: 'Cover', icon: '⤒', tag: styles.tagAccent },
}

const REASON: Record<FillReason, string> = {
  market: 'Market',
  limit: 'Limit',
  stop: 'Stop-loss',
  liquidation: 'Margin call',
}

interface TradesTableProps {
  trades: Trade[]
  showSymbol?: boolean
  empty: ReactNode
}

/** Your fills, newest first, each with its Solana receipt. */
export default function TradesTable({ trades, showSymbol = false, empty }: TradesTableProps) {
  if (trades.length === 0) return <div className={styles.empty}>{empty}</div>

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.left} scope="col">Trade</th>
          {showSymbol && <th className={styles.left} scope="col">Player</th>}
          <th scope="col">Shares</th>
          <th scope="col">Avg price</th>
          <th scope="col">Fee</th>
          <th scope="col">Profit / loss</th>
          <th scope="col">Time</th>
          <th className={styles.left} scope="col">Solana receipt</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(t => {
          const side = SIDE[t.side]
          const confirmed = t.receipt.status === 'confirmed'
          return (
            <tr key={t.trade_id}>
              <td className={styles.left}>
                <span className={`${styles.tag} ${side.tag}`}>{side.icon} {side.label}</span>{' '}
                {t.reason !== 'market' && <span className={styles.muted}>{REASON[t.reason]}</span>}
              </td>
              {showSymbol && (
                <td className={styles.left}>
                  <Link to={`/stock/${t.symbol}`} className={styles.link}><span className={styles.whoName}><PlayerName symbol={t.symbol}/></span></Link>
                </td>
              )}
              <td>{formatQty(t.qty)}</td>
              <td>{formatPrice(t.price)}</td>
              <td className={styles.muted}>{formatHOOP(t.fee)}</td>
              <td className={t.realised_pnl === null ? styles.muted : t.realised_pnl >= 0 ? styles.pnlUp : styles.pnlDown}>
                {t.realised_pnl === null ? '—' : `${trendArrow(t.realised_pnl)} ${formatPnl(t.realised_pnl)}`}
              </td>
              <td className={styles.muted}>{formatClock(t.t)}</td>
              <td className={styles.left}>
                {confirmed ? (
                  <>
                    <span className={`${styles.tag} ${styles.tagUp}`}>
                      ✓ Confirmed{t.receipt.confirm_ms !== null ? ` in ${formatSeconds(t.receipt.confirm_ms)}` : ''}
                    </span>{' '}
                    <a className={styles.explorer} href={t.receipt.explorer_url} target="_blank" rel="noreferrer">Explorer ↗</a>
                  </>
                ) : (
                  <span className={`${styles.tag} ${styles.tagNeutral}`}>{t.receipt.status === 'disabled' ? 'Solana paused' : t.receipt.status === 'failed' ? 'Failed' : '◷ Settling…'}</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
