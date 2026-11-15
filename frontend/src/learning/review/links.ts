import { termKey } from '../content'

/** Where a card's "Learn it" link goes: the tutorial card or the glossary entry on /learn. */
export function learnHref(kind: 'tutorial' | 'glossary', id: string, label: string): string {
  return kind === 'tutorial' ? `/learn#tutorial-${id}` : `/learn#glossary-${termKey(label)}`
}
