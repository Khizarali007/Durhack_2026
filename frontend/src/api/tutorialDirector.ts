import type { DirectorResult } from './types'
export type TutorialMoment = 'tutorial_sga_heat' | 'tutorial_jokic_buzz' | 'wemby_storm'
export const TUTORIAL_MOMENTS_AVAILABLE = false
export async function playTutorialMoment(_name: TutorialMoment): Promise<DirectorResult> {
  void _name
  return {ok:false, detail:'The season tutorial uses recorded games; it does not inject events.'}
}
