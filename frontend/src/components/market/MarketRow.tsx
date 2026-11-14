import { memo } from 'react'
import { Badge, Pill } from '../ui'
import { useQuote, useSparkline, getInitPrice } from '../../api'
import type { Player } from '../../api'
import { formatHOOP, formatPct, formatPrice, trendArrow } from '../../utils/format'
import { teamColor, playerInitials } from '../../utils/teamColors'
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash'
import SparklineCell from './SparklineCell'
import RadarBadge from './RadarBadge'
import styles from './MarketRow.module.css'

interface MarketRowProps {
  player: Player
  isHighlighted: boolean
  /** Compact four-column form for the watchlist beside the chart. */
  compact?: boolean
  /** The stock currently open on the trading screen. */
  isSelected?: boolean
}

/** Price, and change since the first price seen today, for one row. */
function useRowQuote(symbol: string) {
  const quote = useQuote(symbol)
  const initPrice = getInitPrice(symbol)
  const changePct = quote != null && initPrice != null ? ((quote.last - initPrice) / initPrice) * 100 : null
  const changeAbs = quote != null && initPrice != null ? quote.last - initPrice : null
  const flash = usePriceFlash(quote?.last ?? null)
  return { quote, changePct, changeAbs, flash }
}

const FullRow = memo(function FullRow({ player, isHighlighted }: MarketRowProps) {
  const { quote, changePct, changeAbs, flash } = useRowQuote(player.symbol)
  const sparkline = useSparkline(player.symbol)

  const rowClass = [styles.row, isHighlighted ? styles.highlighted : ''].filter(Boolean).join(' ')

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

      {/* Only the price cell flashes: 300 whole rows blinking twice a second is unreadable */}
      <div className={`${styles.colPrice} ${flashClass(flash)}`}>{formatPrice(quote?.last)}</div>

      <div className={styles.colChange}>
        {changePct != null
          ? <span className={changePct >= 0 ? styles.up : styles.down}>{formatPct(changePct)}</span>
          : <span>—</span>}
        {changeAbs != null &&
          <span className={`${styles.changeAbs} ${changeAbs >= 0 ? styles.up : styles.down}`}>
            {changeAbs >= 0 ? '+' : ''}{formatHOOP(changeAbs)}
          </span>}
      </div>

      <div className={styles.colBid}>{formatPrice(quote?.bid)}</div>
      <div className={styles.colAsk}>{formatPrice(quote?.ask)}</div>

      <div className={styles.colSpark}>
        <SparklineCell prices={sparkline} />
      </div>

      <div className={styles.colRadar}>
        <RadarBadge symbol={player.symbol} />
      </div>
    </div>
  )
})

const CompactRow = memo(function CompactRow({ player, isHighlighted, isSelected }: MarketRowProps) {
  const { quote, changePct, flash } = useRowQuote(player.symbol)

  const rowClass = [
    styles.compact,
    isSelected ? styles.selected : '',
    isHighlighted && !isSelected ? styles.compactHover : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rowClass} aria-current={isSelected ? 'true' : undefined}>
      <Badge initials={playerInitials(player.name)} color={teamColor(player.team)} size="md" />
      <div className={styles.colName}>
        <span className={styles.compactName}>{player.name}</span>
        <span className={styles.playerName}>{player.team} · {player.symbol}</span>
      </div>
      <div className={`${styles.compactPrice} ${flashClass(flash)}`}>{formatPrice(quote?.last)}</div>
      <div className={styles.compactChange}>
        {changePct != null
          ? <Pill variant={changePct >= 0 ? 'up' : 'down'}>{trendArrow(changePct)} {formatPct(changePct)}</Pill>
          : <Pill variant="neutral">—</Pill>}
      </div>
    </div>
  )
})

const MarketRow = memo(function MarketRow(props: MarketRowProps) {
  return props.compact ? <CompactRow {...props} /> : <FullRow {...props} />
})

export default MarketRow
