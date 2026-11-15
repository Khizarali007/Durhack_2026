import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { markAllRead, updateAlert, useMoveReason, useStormAlerts } from '../../api'
import type { StormAlert } from '../../api'
import { formatHOOP, formatQty } from '../../utils/format'
import styles from './StormAlerts.module.css'

function title(a: StormAlert): string {
  return a.state === 'storm' ? `Storm hit: ${a.name}` : `Storm warning: ${a.name}`
}

/** Header bell: unread count and a list of alerts linking to each player. */
export function StormBell() {
  const alerts = useStormAlerts()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = alerts.filter((a) => !a.read).length

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className={styles.bellWrap} ref={ref}>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          if (unread) markAllRead()
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className={styles.count}>{unread}</span>}
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Alerts">
          <strong className={styles.menuTitle}>Alerts on your players</strong>
          {alerts.length === 0 && <p className={styles.muted}>No alerts yet. You'll hear here when a player you own is listed on the injury report.</p>}
          {alerts.slice(0, 12).map((a) => (
            <Link key={a.id} to={`/stock/${a.symbol}`} className={styles.item} role="menuitem" onClick={() => setOpen(false)}>
              <span className={a.state === 'storm' ? styles.storm : styles.cloudy} aria-hidden="true">{a.state === 'storm' ? '⛈' : '⛅'}</span>
              <span>
                <strong>{title(a)}</strong>
                <small className={styles.muted}>
                  Estimated risk {formatHOOP(a.risk)}{a.status === 'kept' ? ' · kept' : ''}
                </small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AlertCard({ alert }: { alert: StormAlert }) {
  const navigate = useNavigate()
  const reason = useMoveReason(alert.symbol)
  const fallback = alert.state === 'storm' ? 'Ruled out on the official injury report.' : 'Listed on the official injury report.'
  const half = Math.max(1, Math.floor(alert.qty / 2))
  const go = (query: string) => {
    updateAlert(alert.id, { status: 'closed', read: true })
    navigate(`/stock/${alert.symbol}?${query}`)
  }
  return (
    <div className={`${styles.card} ${alert.state === 'storm' ? styles.cardStorm : styles.cardCloudy}`} role="alert">
      <div className={styles.cardHead}>
        <strong>{title(alert)}</strong>
        <button type="button" className={styles.close} aria-label="Close alert" onClick={() => updateAlert(alert.id, { status: 'closed', read: true })}>
          ×
        </button>
      </div>
      <p className={styles.reason}>{reason && reason.source !== 'price' ? reason.text : fallback}</p>
      <p className={styles.money}>
        You hold {formatQty(alert.qty)} shares worth {formatHOOP(alert.value)}. Estimated risk: <b>{formatHOOP(alert.risk)}</b>
        <small className={styles.muted}> (estimate)</small>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => go('action=stop')}>Set a stop-loss</button>
        <button type="button" className={styles.secondary} onClick={() => go(`action=trim&qty=${half}`)}>Trim my position</button>
        <button type="button" className={styles.secondary} onClick={() => updateAlert(alert.id, { status: 'kept', read: true })}>Keep holding</button>
      </div>
      <small className={styles.muted}>Nothing is traded until you confirm on the order ticket.</small>
    </div>
  )
}

/** The newest open alert, top-right, until closed. */
export function StormAlertPopup() {
  const alerts = useStormAlerts()
  const open = alerts.find((a) => a.status === 'open')
  if (!open) return null
  return <AlertCard alert={open} />
}
