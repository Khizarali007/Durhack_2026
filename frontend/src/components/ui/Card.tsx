import type { CSSProperties, ReactNode } from 'react'
import styles from './Card.module.css'

export interface CardProps {
  raised?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function Card({ raised = false, padding = 'md', children, className, style }: CardProps) {
  const paddingClass = {
    none: styles.paddingNone,
    sm: styles.paddingSm,
    md: styles.paddingMd,
    lg: styles.paddingLg,
  }[padding]

  const cls = [styles.card, raised ? styles.raised : '', paddingClass, className ?? '']
    .filter(Boolean)
    .join(' ')

  return <div className={cls} style={style}>{children}</div>
}
