import { PlayerAvatar } from '../PlayerIdentity'
import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pill } from '../ui'
import { useQuote, getInitPrice } from '../../api'
import type { Player } from '../../api'
import { formatHOOP, formatPct } from '../../utils/format'
import styles from './MoverCard.module.css'

const MoverCard = memo(function MoverCard({ player }: { player: Player }) {
  const navigate = useNavigate()
  const quote = useQuote(player.symbol)
  const initPrice = getInitPrice(player.symbol)
  const pct = quote != null && initPrice != null
    ? (((quote.quoted_price ?? quote.last) - initPrice) / initPrice) * 100
    : null

  return (
    <button
      className={styles.card}
      onClick={() => navigate(`/stock/${player.symbol}`)}
      type="button"
      aria-label={`${player.name} ${pct != null ? formatPct(pct) : ''}`}
    >
      <PlayerAvatar player={player} size="sm" />
      <div className={styles.body}>
        <div className={styles.symbol}>{player.name}</div>
        <div className={styles.price}>{quote != null ? formatHOOP((quote.quoted_price ?? quote.last)) : '—'}</div>
      </div>
      <Pill variant={pct != null && pct >= 0 ? 'up' : 'down'}>
        {pct != null ? formatPct(pct) : '—'}
      </Pill>
    </button>
  )
})

export default MoverCard
