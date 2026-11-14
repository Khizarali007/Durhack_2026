import { useQuote, useMoveReason, getInitPrice } from '../../api'
import type { Player, MarketEventKind } from '../../api'
import { Badge, Pill } from '../ui'
import RadarBadge from '../market/RadarBadge'
import { formatPct, formatPrice, trendArrow } from '../../utils/format'
import { teamColor, playerInitials } from '../../utils/teamColors'
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash'
import styles from './PlayerCard.module.css'

const KIND_ICON: Record<MarketEventKind, string> = {
  early_warning: '⚠',
  injury: '⛈',
  hot_streak: '🔥',
  rest_day: '☾',
  trade_rumour: '🗨',
}

/** Hype within this band reads as "about fair" rather than a gap. */
const FAIR_BAND_PCT = 1

interface PlayerCardProps {
  player: Player
}

/** Who the stock is, what it costs against fair value, and why it last moved. */
export default function PlayerCard({ player }: PlayerCardProps) {
  const quote = useQuote(player.symbol)
  const reason = useMoveReason(player.symbol)
  const flash = usePriceFlash(quote?.last ?? null)
  const initPrice = getInitPrice(player.symbol)

  const hype = quote !== null && quote.fair_value > 0
    ? (quote.last - quote.fair_value) / quote.fair_value * 100
    : null
  const changePct = quote !== null && initPrice !== undefined
    ? (quote.last - initPrice) / initPrice * 100
    : null

  const hypeClass = hype === null || Math.abs(hype) < FAIR_BAND_PCT
    ? styles.hypeFair
    : hype > 0 ? styles.hypeHot : styles.hypeCold
  const hypeWord = hype === null ? '' : Math.abs(hype) < FAIR_BAND_PCT ? 'about fair' : hype > 0 ? 'hype' : 'discount'

  const reasonIcon = reason === null ? '' : reason.kind !== null ? KIND_ICON[reason.kind] : reason.source === 'whistle' ? '🏁' : '⚖'

  return (
    <section className={styles.card} aria-label={`${player.name} summary`}>
      <div className={styles.identity} data-tour="stock-identity">
        <Badge initials={playerInitials(player.name)} color={teamColor(player.team)} size="lg" />
        <div className={styles.names}>
          <h1 className={styles.name}>{player.name}</h1>
          <div className={styles.meta}>
            <span>{player.team}</span>
            {player.position && <span>· {player.position}</span>}
            <span>· {player.symbol}</span>
            <RadarBadge symbol={player.symbol} showLabel />
          </div>
        </div>
      </div>

      <div className={styles.priceBlock} data-tour="stock-price">
        <div className={`${styles.price} ${flashClass(flash)}`} aria-live="off">
          {formatPrice(quote?.last)}
          <span className={styles.unit}>HOOP</span>
        </div>
        {changePct !== null
          ? <Pill variant={changePct >= 0 ? 'up' : 'down'}>{trendArrow(changePct)} {formatPct(changePct)} today</Pill>
          : <Pill variant="neutral">— today</Pill>}
      </div>

      <div className={styles.valueLine} data-tour="stock-value-line">
        <span>Price <strong className={styles.num}>{formatPrice(quote?.last)}</strong></span>
        <span className={styles.dot}>·</span>
        <span>Fair value <strong className={styles.num}>{formatPrice(quote?.fair_value)}</strong></span>
        <span className={styles.dot}>·</span>
        <span className={`${styles.hype} ${hypeClass}`} data-tour="stock-hype">
          {hype === null ? '—' : `${hype > 0 ? '▲' : hype < 0 ? '▼' : ''} ${formatPct(hype)} ${hypeWord}`}
        </span>
      </div>

      <div className={styles.reason} title={reason?.text} data-tour="stock-why-moved">
        <span className={styles.reasonLabel}>Why did it move?</span>
        <span className={styles.reasonText}>
          {reason === null ? 'Waiting for the first price…' : <><span aria-hidden="true">{reasonIcon}</span> {reason.text}</>}
        </span>
      </div>
    </section>
  )
}
