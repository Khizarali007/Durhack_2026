import type { ReactNode } from 'react'
import styles from './Notice.module.css'

export interface NoticeProps {
  tone: 'up' | 'info'
  children: ReactNode
  onDismiss: () => void
  dismissLabel: string
}

/** A one-line banner under the season bar. Calm colours from the design tokens. */
export default function Notice({ tone, children, onDismiss, dismissLabel }: NoticeProps) {
  return (
    <div role="status" className={`${styles.notice} ${tone === 'up' ? styles.up : styles.info}`}>
      <span className={styles.text}>{children}</span>
      <button type="button" className={styles.dismiss} aria-label={dismissLabel} onClick={onDismiss}>
        ×
      </button>
    </div>
  )
}
