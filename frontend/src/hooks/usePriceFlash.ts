import { useEffect, useRef, useState } from 'react'

/**
 * 'up' or 'down' for about 200 ms after `value` changes, otherwise null.
 * Pair it with the global `flash-up` / `flash-down` classes: background only, never layout.
 */
export function usePriceFlash(value: number | null): 'up' | 'down' | null {
  const prevRef = useRef<number | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (value === null) return
    if (prevRef.current === null) { prevRef.current = value; return }
    if (value === prevRef.current) return
    setFlash(value > prevRef.current ? 'up' : 'down')
    prevRef.current = value
    const timer = setTimeout(() => setFlash(null), 250)
    return () => clearTimeout(timer)
  }, [value])

  return flash
}

export function flashClass(flash: 'up' | 'down' | null): string {
  return flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''
}
