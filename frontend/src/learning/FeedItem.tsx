import type { MissionMessage } from '../api'
import { formatClock } from './format'
import { ALERTS, FALLBACK_ALERT } from './missionCopy'
import tokens from './tokens.module.css'
import styles from './FeedItem.module.css'

export interface FeedItemProps {
  msg: MissionMessage
}

const KIND_LABEL: Record<string, string> = {
  hint: 'Coach',
  message: 'Floor',
  state: 'Bell',
}

/** One line of the mission feed. News events render as a weather-style alert. */
export function FeedItem({ msg }: FeedItemProps) {
  const time = (
    <span className={`num ${styles.time}`}>
      <span className={tokens.srOnly}>at </span>
      {formatClock(msg.t)}
    </span>
  )

  if (msg.kind === 'event') {
    const alert = (msg.event_kind && ALERTS[msg.event_kind]) || FALLBACK_ALERT
    return (
      <li className={`${tokens.tokens} ${styles.alert} ${styles[alert.tone]}`}>
        <div className={styles.alertHead}>
          <span className={styles.alertLabel}>Breaking · {alert.label}</span>
          {msg.symbol && <span className={styles.symbol}>{msg.symbol}</span>}
          {time}
        </div>
        <p className={styles.headline}>{msg.text}</p>
      </li>
    )
  }

  return (
    <li className={`${tokens.tokens} ${styles.item} ${msg.kind === 'hint' ? styles.hint : ''}`}>
      <span className={styles.kind}>{KIND_LABEL[msg.kind] ?? 'Floor'}</span>
      <span className={styles.text}>{msg.text}</span>
      {time}
    </li>
  )
}
