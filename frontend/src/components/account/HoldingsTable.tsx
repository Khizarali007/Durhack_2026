import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useQuote } from '../../api'
import type { PositionOut } from '../../api'
import { Badge } from '../ui'
import { formatHOOP, formatPct, formatPnl, formatPrice, formatQty, trendArrow } from '../../utils/format'
import { teamColor, playerInitials } from '../../utils/teamColors'
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash'
import styles from '../orders/tables.module.css'

/** One holding, priced off its own live quote so it moves every tick. */
const HoldingRow = memo(function HoldingRow({ position, equity }: { position: PositionOut; equity: number }) {
  const quote = useQuote(position.symbol)
  const last = position.mark_price ?? position.last_price
  const flash = usePriceFlash(quote?.last ?? null)

  const shares = Math.abs(position.qty)
  const short = position.qty < 0
  const value = Math.abs(position.market_value)
  const cost = shares * position.avg_cost
  const pnl = position.unrealised_pnl
  const pnlPct = cost > 0 ? pnl / cost * 100 : 0
  const weight = equity > 0 ? value / equity * 100 : 0
  const name = position.name ?? position.symbol
  const pnlClass = pnl > 0 ? styles.pnlUp : pnl < 0 ? styles.pnlDown : styles.muted

  return (
    <tr>
      <td className={styles.left}>
        <Link to={`/stock/${position.symbol}`} className={`${styles.link} ${styles.who}`}>
          <Badge initials={playerInitials(name)} color={teamColor(position.team ?? '')} size="md" />
          <span className={styles.whoText}>
            <span className={styles.whoName}>{name}</span>
            <span className={styles.whoSub}>{position.team ?? '—'} · {position.symbol}{short ? ' · short' : ''}</span>
          </span>
        </Link>
      </td>
      <td>{formatQty(shares)}</td>
      <td>{formatPrice(position.avg_cost)}</td>
      <td><span className={flashClass(flash)} style={{ padding: '2px 4px', borderRadius: 'var(--hs-radius-sm)' }}>{formatPrice(last)}</span></td>
      <td>{formatHOOP(value)}</td>
      <td className={pnlClass}>{trendArrow(pnl)} {formatPnl(pnl)}</td>
      <td className={pnlClass}>{formatPct(pnlPct)}</td>
      <td className={styles.muted}>{weight.toFixed(1)}%</td>
    </tr>
  )
})

interface HoldingsTableProps {
  positions: PositionOut[]
  equity: number
}

export default function HoldingsTable({ positions, equity }: HoldingsTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.left} scope="col">Player</th>
          <th scope="col">Shares</th>
          <th scope="col">Avg cost</th>
          <th scope="col">Price now</th>
          <th scope="col">Value</th>
          <th scope="col">Profit / loss</th>
          <th scope="col">Return</th>
          <th scope="col">Of equity</th>
        </tr>
      </thead>
      <tbody>
        {positions.map(p => <HoldingRow key={p.symbol} position={p} equity={equity} />)}
      </tbody>
    </table>
  )
}
