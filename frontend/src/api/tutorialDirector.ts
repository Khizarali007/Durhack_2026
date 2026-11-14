import type { DirectorResult } from './types'
import { USE_MOCKS } from './config'
import { mockDirector } from '../mocks/mockDirector'

// "Market moments" for Person 4's guided tutorials: a scripted headline the
// tutorial needs (a hot streak on SGA, a storm on WEMBY). Mock only, like the
// director: against the real backend nothing fires and the tutorial shows a
// "this happens on its own in the live market" fallback instead.

export type TutorialMoment = 'tutorial_sga_heat' | 'tutorial_jokic_buzz' | 'wemby_storm'

/** True when tutorial moments actually fire. */
export const TUTORIAL_MOMENTS_AVAILABLE = USE_MOCKS

export async function playTutorialMoment(name: TutorialMoment): Promise<DirectorResult> {
  if (!USE_MOCKS) {
    return { ok: false, detail: 'Not available: there is no director on the live market yet' }
  }
  return mockDirector.playScenario(name)
}
