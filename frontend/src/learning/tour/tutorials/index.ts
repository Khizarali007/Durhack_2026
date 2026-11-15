import type { Tutorial } from '../types'
import { payouts } from './payouts'
import { firstTrade } from './firstTrade'
import { hypeVsFundamentals } from './hypeVsFundamentals'
import { readTheSpread } from './readTheSpread'
import { surviveTheStorm } from './surviveTheStorm'
import { welcome } from './welcome'

/** Every tutorial, beginner first. */
export const TUTORIALS: Tutorial[] = [
  welcome,
  firstTrade,
  readTheSpread,
  hypeVsFundamentals,
  surviveTheStorm,
  payouts,
]

export function findTutorial(id: string | null | undefined): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id)
}

/** The first tutorial that can be played and isn't finished yet. */
export function nextTutorial(completed: Record<string, unknown>, after?: string): Tutorial | undefined {
  const start = after ? TUTORIALS.findIndex((t) => t.id === after) + 1 : 0
  const ordered = [...TUTORIALS.slice(start), ...TUTORIALS.slice(0, start)]
  return ordered.find((t) => !t.comingSoon && !completed[t.id])
}

/** Which tutorial teaches a glossary term: the first playable one, else the first coming soon. */
export function tutorialForTerm(term: string): Tutorial | undefined {
  const key = term.toLowerCase()
  const teaching = TUTORIALS.filter((t) => t.teaches.some((x) => x.toLowerCase() === key))
  return teaching.find((t) => !t.comingSoon) ?? teaching[0]
}
