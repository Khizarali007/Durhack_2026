import { contrastColor } from '../../utils/colorContrast'
import styles from './Badge.module.css'

export interface BadgeProps {
  initials: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}

export function Badge({ initials, color, size = 'md' }: BadgeProps) {
  const sizeClass = { sm: styles.sm, md: styles.md, lg: styles.lg }[size]

  return (
    <span
      className={`${styles.badge} ${sizeClass}`}
      style={{ backgroundColor: color, color: contrastColor(color) }}
    >
      {initials.slice(0, 3).toUpperCase()}
    </span>
  )
}
