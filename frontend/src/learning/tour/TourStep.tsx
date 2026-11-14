import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { playTutorialMoment, TUTORIAL_MOMENTS_AVAILABLE } from '../../api'
import { Button } from '../../components/ui'
import { buildContext } from './summary'
import { tour } from './store'
import type { TutorialRun } from './store'
import type { TourContext, TourStep as Step, Tutorial } from './types'
import { findTarget, useTargetRect } from './useTargetRect'
import type { Box } from './useTargetRect'
import styles from './tour.module.css'

const PAD = 6
const GAP = 12
const EDGE = 12
const CARD_WIDTH = 340

function copy(text: Step['body'] | undefined, ctx: TourContext): string {
  if (text === undefined) return ''
  return typeof text === 'function' ? text(ctx) : text
}

function routeMatches(pathname: string, path: string, prefix?: boolean): boolean {
  const a = pathname.toLowerCase()
  const b = path.toLowerCase()
  return prefix ? a.startsWith(b) : a === b
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function inputValue(step: Step): string | null {
  const el = findTarget(step.target, step.selector)
  if (!el) return null
  const input = el instanceof HTMLInputElement ? el : el.querySelector('input')
  return input ? input.value.trim().toLowerCase() : null
}

/** Where the coach card goes: beside the spotlight if there's room, else above or below. */
function placeCard(hole: Box | null, cardHeight: number): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (hole === null) {
    return { left: Math.max(EDGE, (vw - CARD_WIDTH) / 2), top: Math.max(EDGE, (vh - cardHeight) / 2) }
  }
  const clampTop = (t: number) => Math.min(Math.max(EDGE, t), Math.max(EDGE, vh - cardHeight - EDGE))
  const clampLeft = (l: number) => Math.min(Math.max(EDGE, l), Math.max(EDGE, vw - CARD_WIDTH - EDGE))
  const right = hole.left + hole.width
  const bottom = hole.top + hole.height
  if (vw - right - GAP >= CARD_WIDTH + EDGE) return { left: right + GAP, top: clampTop(hole.top) }
  if (hole.left - GAP >= CARD_WIDTH + EDGE) return { left: hole.left - GAP - CARD_WIDTH, top: clampTop(hole.top) }
  if (vh - bottom - GAP >= cardHeight + EDGE) return { left: clampLeft(hole.left), top: bottom + GAP }
  if (hole.top - GAP >= cardHeight + EDGE) return { left: clampLeft(hole.left), top: hole.top - GAP - cardHeight }
  return { left: vw - CARD_WIDTH - EDGE, top: vh - cardHeight - EDGE }
}

interface TourStepProps {
  tutorial: Tutorial
  run: TutorialRun
  index: number
}

/** One step: dims the page, spotlights the target, and shows the coach card. */
export function TourStep({ tutorial, run, index }: TourStepProps) {
  const step = tutorial.steps[index]
  const total = tutorial.steps.length
  const last = index === total - 1
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(220)
  const [waitedOut, setWaitedOut] = useState(false)
  // Steps already done when you arrive (Back, Resume) never auto-advance.
  const [doneOnArrival] = useState(() => run.done.includes(index))
  const [, setClock] = useState(0)

  const rect = useTargetRect(step.target, step.selector)
  const hasTarget = Boolean(step.target || step.selector)
  const action = step.complete.type !== 'next'
  const done = run.done.includes(index)
  const fallback = run.fallback.includes(index)
  const canNext = !action || done || fallback || waitedOut
  const ctx = buildContext(run, index)

  // Go to the step's page once, when the step starts. (navigate changes identity
  // whenever the location does, so a ref keeps this from pulling the user back.)
  const routed = useRef(false)
  useEffect(() => {
    if (routed.current) return
    routed.current = true
    if (step.route && !routeMatches(window.location.pathname, step.route)) navigate(step.route)
  }, [step.route, navigate])

  // Focus moves into the card; live values in the copy refresh with the 2 Hz ticks.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
    const id = setInterval(() => setClock((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = cardRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setCardHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- Completion watchers ---
  const c = step.complete

  useEffect(() => {
    if (done || c.type !== 'click') return undefined
    const onClick = (e: MouseEvent) => {
      const el = findTarget(step.target, step.selector)
      if (el && e.target instanceof Node && el.contains(e.target)) tour.markDone(index)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [done, c.type, step.target, step.selector, index])

  useEffect(() => {
    if (!done && c.type === 'navigate' && routeMatches(pathname, c.path, c.prefix)) tour.markDone(index)
  }, [done, c, pathname, index])

  useEffect(() => {
    if (done || c.type !== 'input') return undefined
    const want = (typeof c.value === 'function' ? c.value(buildContext(run, index)) : c.value).toLowerCase()
    const check = () => {
      if (inputValue(step) === want) tour.markDone(index)
    }
    check()
    const id = setInterval(check, 250)
    return () => clearInterval(id)
  }, [done, c, step, index, run])

  useEffect(() => {
    if (done || c.type !== 'order_filled') return
    const hit = run.trades.find(
      (t) => t.side === c.side && t.symbol === c.symbol && (!c.reason || t.reason === c.reason) && !run.claimed.includes(t.trade_id),
    )
    if (hit) tour.markDone(index, hit.trade_id)
  }, [done, c, run.trades, run.claimed, index])

  useEffect(() => {
    if (done || c.type !== 'event') return
    const hit = run.events.find((e) => e.kind === c.kind && e.symbol === c.symbol && !run.claimed.includes(e.key))
    if (hit) tour.markDone(index, hit.key)
  }, [done, c, run.events, run.claimed, index])

  // Market moments: ask the tutorial director once per run; live market shows the fallback.
  useEffect(() => {
    if (done || c.type !== 'event') return
    if (!TUTORIAL_MOMENTS_AVAILABLE) {
      tour.markFallback(index)
      return
    }
    if (c.moment && tour.claimMoment(c.moment)) {
      void playTutorialMoment(c.moment).then((r) => {
        if (!r.ok) tour.markFallback(index)
      })
    }
  }, [done, c, index])

  useEffect(() => {
    if (done || !step.waitSeconds) return undefined
    const id = setTimeout(() => setWaitedOut(true), step.waitSeconds * 1000)
    return () => clearTimeout(id)
  }, [done, step.waitSeconds])

  const goNext = () => {
    if (last) tour.finish()
    else tour.goTo(index + 1)
  }

  // An action with nothing more to say moves on by itself.
  const autoAdvance = action && done && !doneOnArrival && !step.after
  useEffect(() => {
    if (!autoAdvance) return undefined
    const id = setTimeout(() => (last ? tour.finish() : tour.goTo(index + 1)), 500)
    return () => clearTimeout(id)
  }, [autoAdvance, last, index])

  // Keyboard: Esc exits, Enter is Next (unless you're typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        tour.exit()
      } else if (e.key === 'Enter' && canNext && !isTyping(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        if (last) tour.finish()
        else tour.goTo(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canNext, last, index])

  // --- Layout ---
  const hole: Box | null = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null
  // While an action is waiting, only the spotlighted element is clickable.
  const holeOpen = action && !done
  // An action whose target can't be found leaves the page usable rather than locking it.
  const dim = hole !== null || !hasTarget || !action
  const cardStyle = placeCard(hole, cardHeight)

  const titleId = `tour-title-${tutorial.id}-${index}`
  const after = done ? copy(step.after, ctx) : ''
  const fallbackText = fallback && !done && c.type === 'event' ? c.fallback : ''
  const waitText = waitedOut && !done && !fallback ? step.waitNote ?? 'Taking a while? You can carry on.' : ''
  const status = !action ? '' : done ? 'Done' : fallback || waitedOut ? '' : waitingLabel(step)

  return (
    <div className={styles.root}>
      {dim && hole === null && <div className={styles.dim} style={{ inset: 0 }} />}
      {dim && hole !== null && (
        <>
          <div className={styles.dim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
          <div className={styles.dim} style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className={styles.dim} style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
          <div className={styles.dim} style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          {!holeOpen && <div className={styles.blocker} style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />}
          <div className={styles.ring} style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
        </>
      )}

      <div
        ref={cardRef}
        className={styles.card}
        style={{ ...cardStyle, width: CARD_WIDTH }}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.cardHead}>
          <span className="label">{tutorial.title}</span>
          <span className={`num ${styles.counter}`}>
            {index + 1} of {total}
          </span>
        </div>
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p className={styles.body}>{copy(step.body, ctx)}</p>

        {status && (
          <p className={`${styles.status} ${done ? styles.statusDone : ''}`}>
            <span aria-hidden="true">{done ? '✓' : '●'}</span> {status}
          </p>
        )}
        {after && <p className={styles.after}>{after}</p>}
        {fallbackText && <p className={styles.fallback}>{fallbackText}</p>}
        {waitText && <p className={styles.fallback}>{waitText}</p>}

        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => tour.goTo(index - 1)} disabled={index === 0}>
            Back
          </Button>
          <Button variant="primary" size="sm" onClick={goNext} disabled={!canNext}>
            {last ? 'Finish' : 'Next'}
          </Button>
          <button type="button" className={styles.exit} onClick={() => tour.exit()}>
            Exit tutorial
          </button>
        </div>
        <p className={styles.keys}>
          <kbd>Enter</kbd> next · <kbd>Esc</kbd> exit
        </p>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`Step ${index + 1} of ${total}: ${step.title}. ${done && after ? after : ''}`}
      </p>
    </div>
  )
}

function waitingLabel(step: Step): string {
  switch (step.complete.type) {
    case 'click':
      return 'Your turn: click the highlighted spot'
    case 'navigate':
      return 'Your turn: follow the highlighted link'
    case 'input':
      return 'Your turn: type in the highlighted box'
    case 'order_filled':
      return 'Waiting for your order to fill'
    case 'event':
      return 'Watching the market…'
    default:
      return ''
  }
}
