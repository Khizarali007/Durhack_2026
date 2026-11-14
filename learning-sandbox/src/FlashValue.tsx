import { useState } from 'react'
import type { ReactNode } from 'react'

export interface FlashValueProps {
  value: number | null | undefined
  children: ReactNode
  className?: string
}

/** Wraps a number and replays Person 3's .flash-up / .flash-down when it changes. */
export function FlashValue({ value, children, className }: FlashValueProps) {
  const [prev, setPrev] = useState(value)
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null)
  if (value !== prev) {
    setPrev(value)
    if (value != null && prev != null && value !== prev) {
      setFlash({ dir: value > prev ? 'up' : 'down', n: (flash?.n ?? 0) + 1 })
    }
  }
  const cls = [flash ? `flash-${flash.dir}` : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span key={flash?.n ?? 0} className={cls || undefined}>
      {children}
    </span>
  )
}
