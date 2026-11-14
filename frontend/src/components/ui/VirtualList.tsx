import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface VirtualListProps<T> {
  items: T[]
  /** Fixed row height in px. */
  itemHeight: number
  getKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  overscan?: number
  className?: string
  /** Scrolls this row into view whenever it changes (and is off screen). */
  scrollToIndex?: number
  ariaLabel?: string
}

/** Renders only the rows on screen, so a 300-row list stays cheap while it ticks. */
export function VirtualList<T>({
  items, itemHeight, getKey, renderItem, overscan = 6, className, scrollToIndex, ariaLabel,
}: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || scrollToIndex === undefined || scrollToIndex < 0) return
    const top = scrollToIndex * itemHeight
    const bottom = top + itemHeight
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + itemHeight / 2)
    }
  }, [scrollToIndex, itemHeight])

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / itemHeight) + overscan)

  return (
    <div
      ref={ref}
      className={className}
      style={{ overflowY: 'auto', position: 'relative' }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      role="list"
      aria-label={ariaLabel}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => {
          const index = start + i
          return (
            <div
              key={getKey(item)}
              role="listitem"
              style={{ position: 'absolute', top: index * itemHeight, left: 0, right: 0, height: itemHeight }}
            >
              {renderItem(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
