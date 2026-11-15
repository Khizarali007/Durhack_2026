import { PlayerAvatar } from '../PlayerIdentity'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useQuote } from '../../api'
import type { Player } from '../../api'
import { Pill } from '../ui'
import RadarBadge from '../market/RadarBadge'
import { formatPct, formatPrice, trendArrow } from '../../utils/format'
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash'
import styles from './MoverTile.module.css'

/** A large, clickable card for one top mover. One click opens its chart. */
/** `pct` comes from the ranking, so the number shown always matches the card's place in the list. */
const MoverTile = memo(function MoverTile({ player, rank, pct }: { player: Player; rank: number; pct: number }) {
  const quote = useQuote(player.symbol)
  const flash = usePriceFlash(quote?.quoted_price ?? null)

  return (
    <Link to={`/stock/${player.symbol}`} className={styles.tile} aria-label={`${player.name}, open chart`}>
      <span className={styles.rank}>{rank}</span>
      <PlayerAvatar player={player} size="lg" />
      <span className={styles.who}>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.team}>{player.team} <RadarBadge symbol={player.symbol} /></span>
      </span>
      <span className={styles.numbers}>
        <span className={`${styles.price} ${flashClass(flash)}`}>{formatPrice(quote?.quoted_price)}</span>
        <Pill variant={pct >= 0 ? 'up' : 'down'}>{trendArrow(pct)} {formatPct(pct, 2)}</Pill>
      </span>
    </Link>
  )
})

export default MoverTile
