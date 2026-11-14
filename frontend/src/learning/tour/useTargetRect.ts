import { useEffect, useState } from 'react'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export function findTarget(target?: string, selector?: string): HTMLElement | null {
  if (selector) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  if (target) return document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  return null
}

function onScreen(r: DOMRect): boolean {
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
}

function same(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

/**
 * Follows the step's target on scroll, resize and re-render. Returns null while
 * the element is missing or off screen (the card then falls back to the centre).
 */
export function useTargetRect(target?: string, selector?: string): Box | null {
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!target && !selector) return undefined
    let frame = 0
    let scrolled = false
    let last: Box | null = null

    const tick = () => {
      const el = findTarget(target, selector)
      let next: Box | null = null
      if (el) {
        const r = el.getBoundingClientRect()
        if (!onScreen(r) && !scrolled && r.width > 0) {
          scrolled = true
          el.scrollIntoView({ block: 'center', inline: 'nearest' })
        }
        if (onScreen(r)) next = { top: r.top, left: r.left, width: r.width, height: r.height }
      }
      if (!same(last, next)) {
        last = next
        setBox(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, selector])

  return box
}
