import { memo, useState, useEffect, useRef } from 'react'
import { Badge } from '../ui'
import { useQuote, useSparkline, getInitPrice } from '../../api'
import type { Player } from '../../api'
import { formatHOOP, formatPct } from '../../utils/format'
import { teamColor, playerInitials } from '../../utils/teamColors'
import SparklineCell from './SparklineCell'
import RadarBadge from './RadarBadge'
import styles from './MarketRow.module.css'

interface MarketRowProps {
  player: Player
  isHighlighted: boolean
}

const MarketRow = memo(function MarketRow({ player, isHighlighted }: MarketRowProps) {
  const quote = useQuote(player.symbol)
  const sparkline = useSparkline(player.symbol)
  const initPrice = getInitPrice(player.symbol)

  const last = quote?.last ?? null
  const prevLastRef = useRef<number | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (last === null) return
    if (prevLastRef.current === null) { prevLastRef.current = last; return }
    if (last === prevLastRef.current) return
    setFlash(last > prevLastRef.current ? 'up' : 'down')
    prevLastRef.current = last
    const timer = setTimeout(() => setFlash(null), 250)
    return () => clearTimeout(timer)
  }, [last])

  const changePct = quote != null && initPrice != null
    ? ((quote.last - initPrice) / initPrice) * 100
    : null
  const changeAbs = quote != null && initPrice != null
    ? quote.last - initPrice
    : null

  const rowClass = [
    styles.row,
    isHighlighted ? styles.highlighted : '',
    flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rowClass} role="row">
      <div className={styles.colAvatar}>
        <Badge initials={playerInitials(player.name)} color={teamColor(player.team)} size="sm" />
      </div>

      <div className={styles.colName}>
        <span className={styles.symbol}>{player.symbol}</span>
        <span className={styles.playerName}>{player.name}</span>
      </div>

      <div className={styles.colTeam}>{player.team}</div>

      <div className={styles.colPrice}>
        {quote != null ? formatHOOP(quote.last) : '—'}
      </div>

      <div className={styles.colChange}>
        {changePct != null
          ? <span className={changePct >= 0 ? styles.up : styles.down}>{formatPct(changePct)}</span>
          : <span>—</span>}
        {changeAbs != null &&
          <span className={`${styles.changeAbs} ${changeAbs >= 0 ? styles.up : styles.down}`}>
            {changeAbs >= 0 ? '+' : ''}{formatHOOP(changeAbs)}
          </span>}
      </div>

      <div className={styles.colBid}>
        {quote?.bid != null ? formatHOOP(quote.bid) : '—'}
      </div>

      <div className={styles.colAsk}>
        {quote?.ask != null ? formatHOOP(quote.ask) : '—'}
      </div>

      <div className={styles.colSpark}>
        <SparklineCell prices={sparkline} />
      </div>

      <div className={styles.colRadar}>
        <RadarBadge symbol={player.symbol} />
      </div>
    </div>
  )
})

export default MarketRow
