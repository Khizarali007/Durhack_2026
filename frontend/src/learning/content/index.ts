// Learning copy comes from the repo's content/ folder: the same files the
// learning backend serves. Never copy their text into components.
import glossaryJson from '../../../../content/glossary.json'
import missionsJson from '../../../../content/missions.json'

export interface GlossaryEntry {
  term: string
  short: string
}

export const GLOSSARY: GlossaryEntry[] = [...glossaryJson.terms].sort((a, b) => a.term.localeCompare(b.term))

const BY_KEY = new Map(GLOSSARY.map((t) => [termKey(t.term), t]))

/** Stable slug for a term: "Realised profit" -> "realised-profit". */
export function termKey(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function findTerm(term: string): GlossaryEntry | undefined {
  return BY_KEY.get(termKey(term))
}

/** Lesson line for a mission number (1-6) from content/missions.json. */
export function missionLesson(missionNumber: number): string | null {
  const m = missionsJson.missions.find((x) => x.number === missionNumber)
  return m && m.lesson && !m.lesson.includes('TODO') ? m.lesson : null
}
