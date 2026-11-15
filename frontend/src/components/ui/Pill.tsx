import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export interface PillProps {
  variant: 'up' | 'down' | 'neutral' | 'accent'
  children: ReactNode
}

export function Pill({ variant, children }: PillProps) {
  const variantClass = {
    up: styles.up,
    down: styles.down,
    neutral: styles.neutral,
    accent: styles.accent,
  }[variant]

  return <span className={`${styles.pill} ${variantClass}`}>{children}</span>
}
