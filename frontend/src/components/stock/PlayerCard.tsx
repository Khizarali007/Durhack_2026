import { PlayerAvatar } from '../PlayerIdentity'
import { useTourState } from '../../learning/tour/store'
import { useQuote, useMoveReason, useMarketTime } from '../../api'
import type { Player, MarketEventKind } from '../../api'
import { Pill } from '../ui'

import { formatPct, formatPrice, trendArrow } from '../../utils/format'
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash'
import styles from './PlayerCard.module.css'
import RadarBadge from '../market/RadarBadge'

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
  const tour = useTourState()
  const reason = useMoveReason(player.symbol)
  const flash = usePriceFlash(quote?.quoted_price ?? null)
  const initPrice = player.start_price
  const now = useMarketTime()
  const price = quote?.quoted_price ?? null

  const hype = quote !== null && price !== null && quote.fair_value > 0
    ? (price! - quote.fair_value) / quote.fair_value * 100
    : null
  const changePct = price !== null && initPrice > 0
    ? (price! - initPrice) / initPrice * 100
    : null

  const hypeClass = hype === null || Math.abs(hype) < FAIR_BAND_PCT
    ? styles.hypeFair
    : hype > 0 ? styles.hypeHot : styles.hypeCold
  const hypeWord = hype === null ? '' : Math.abs(hype) < FAIR_BAND_PCT ? 'near estimate' : hype > 0 ? 'above estimate' : 'below estimate'

  const reasonIcon = reason === null ? '' : reason.kind !== null ? KIND_ICON[reason.kind] : reason.source === 'whistle' ? '🏁' : '⚖'

  return (
    <section className={styles.card} aria-label={`${player.name} summary`}>
      <div className={styles.identity} data-tour="stock-identity">
        <PlayerAvatar player={player} size="lg" />
        <div className={styles.names}>
          <h1 className={styles.name}>{player.name}</h1>
          <div className={styles.meta}>
            <span>{player.team}</span>
            {player.position && <span>· {player.position}</span>}


          </div>
        </div>
      </div>

      <div className={styles.priceBlock} data-tour="stock-price">
        <div className={`${styles.price} ${flashClass(flash)}`} aria-live="off">
          {formatPrice(price)}

        </div>
        {changePct !== null
          ? <Pill variant={changePct >= 0 ? 'up' : 'down'}>{trendArrow(changePct)} {formatPct(changePct)} since start</Pill>
          : <Pill variant="neutral">— since start</Pill>}
      </div>

      <div className={styles.valueLine} data-tour="stock-value-line">
        <span>Analyst estimate <strong className={styles.num}>{formatPrice(quote?.fair_value)}</strong></span>
        <span className={styles.dot}>·</span>
        <span className={`${styles.hype} ${hypeClass}`}>
          {hype === null ? '—' : `${hype > 0 ? '▲' : hype < 0 ? '▼' : ''} ${formatPct(hype)} ${hypeWord}`}
        </span>
      </div>

      <details className="price-details" open={tour.running||undefined}><summary>Market details</summary><div className={styles.lastTrade}>Last trade: {quote?.last_trade_t == null ? 'No trades yet' : `${formatPrice(quote.last)} · ${Math.max(0,Math.floor((now-quote.last_trade_t)/86400))} days ago`}.</div>
      <div className={styles.reason} title={reason?.text} data-tour="stock-why-moved">
        <RadarBadge symbol={player.symbol} showLabel />
        <span className={styles.reasonLabel}>{reason?.source === 'price' || reason === null ? 'Quote vs estimate' : 'Why did it move?'}</span>
        <span className={styles.reasonText}>
          {reason === null ? 'Waiting for the first price…' : <><span aria-hidden="true">{reasonIcon}</span> {reason.text}</>}
        </span>
      </div></details>
    </section>
  )
}
