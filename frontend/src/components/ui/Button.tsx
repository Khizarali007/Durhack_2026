import type { MouseEventHandler, ReactNode } from 'react'
import styles from './Button.module.css'

export interface ButtonProps {
  variant?: 'primary' | 'ghost' | 'buy' | 'sell'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
}: ButtonProps) {
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={cls} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  )
}
