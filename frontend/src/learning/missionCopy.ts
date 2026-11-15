// Words for the learning components. The weather-forecast tone lives here;
// the visuals stay plain.

import type { MissionOutcome, MissionResult, MissionState } from '../api'
import { formatPrice } from './format'

export type AlertTone = 'heat' | 'watch' | 'storm' | 'calm' | 'fog'

export interface AlertStyle {
  label: string
  tone: AlertTone
}

/** Headline styling per market event kind. */
export const ALERTS: Record<string, AlertStyle> = {
  hot_streak: { label: 'Heat advisory', tone: 'heat' },
  early_warning: { label: 'Weather watch', tone: 'watch' },
  injury: { label: 'Storm warning', tone: 'storm' },
  rest_day: { label: 'Calm spell', tone: 'calm' },
  trade_rumour: { label: 'Fog advisory', tone: 'fog' },
}

export const FALLBACK_ALERT: AlertStyle = { label: 'News', tone: 'fog' }

export type PillTone = 'up' | 'down' | 'neutral' | 'accent'

export const STATE_LABEL: Record<MissionState, { label: string; tone: PillTone }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  running: { label: 'Live', tone: 'accent' },
  completed: { label: 'Passed', tone: 'up' },
  failed: { label: 'Not passed', tone: 'down' },
  stopped: { label: 'Stopped', tone: 'neutral' },
}

export const HEADLINES: Record<MissionOutcome, { title: string; sub: string }> = {
  passed_great: { title: 'Mission passed!', sub: 'Sunshine all round. You caught the move.' },
  passed_ok: { title: 'Mission passed', sub: 'Profit in the bag.' },
  still_holding: { title: 'Still holding at the bell', sub: 'Paper profit only. Selling is what locks it in.' },
  sold_at_loss: { title: 'Sold at a loss', sub: 'You sold for less than you paid.' },
  never_bought: { title: 'Cash on the bench', sub: 'Your cash stayed on the bench.' },
}

export const HELP = {
  score:
    'How much of the available move you caught. 100 means you bought at the very bottom and sold at the very top.',
  realised: "Profit you've locked in by selling, after fees. Money in the bank.",
  best: 'The lowest price before the big move and the highest price after it.',
  hint: 'A nudge from the coach. It never gives the answer away.',
}

export function headlineFor(result: MissionResult): { title: string; sub: string } {
  return (
    HEADLINES[result.outcome as MissionOutcome] ?? {
      title: result.passed ? 'Passed' : 'Not passed',
      sub: '',
    }
  )
}

/** "You bought at 48.05, sold at 55.92. Best possible was 47.67 to 56.16." */
export function tradeSummary(r: MissionResult): string {
  const best =
    r.best_entry_price != null && r.best_exit_price != null
      ? `Best possible was ${formatPrice(r.best_entry_price)} to ${formatPrice(r.best_exit_price)}.`
      : ''
  let you: string
  if (r.entry_price == null) you = "You didn't buy."
  else if (r.exit_price == null) you = `You bought at ${formatPrice(r.entry_price)} and were still holding at the bell.`
  else you = `You bought at ${formatPrice(r.entry_price)}, sold at ${formatPrice(r.exit_price)}.`
  return [you, best].filter(Boolean).join(' ')
}

/** Screen-reader countdown: announces only at 30 s, 10 s and the bell. */
export function countdownAnnouncement(running: boolean, secondsLeft: number | null): string {
  if (!running || secondsLeft == null) return ''
  if (secondsLeft <= 0) return 'Time is up'
  if (secondsLeft <= 10) return '10 seconds left'
  if (secondsLeft <= 30) return '30 seconds left'
  return ''
}
