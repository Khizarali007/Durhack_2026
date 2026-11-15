import { Link } from 'react-router-dom'
import { Tooltip } from '../../components/ui'
import { findTerm, termKey } from '../content'
import help from '../HelpTip.module.css'

export interface GlossaryTermProps {
  /** A term from content/glossary.json, e.g. "Spread". Unknown terms render nothing. */
  term: string
}

/**
 * A "?" next to a jargon word. Hover or focus shows the short definition in
 * Person 3's Tooltip; clicking opens the full glossary on /learn.
 */
export function GlossaryTerm({ term }: GlossaryTermProps) {
  const entry = findTerm(term)
  if (!entry) return null
  return (
    <span className={help.help}>
      <Tooltip
        content={
          <>
            <strong>{entry.term}:</strong> {entry.short} <em>Click for the glossary.</em>
          </>
        }
      >
        <Link
          to={`/learn#glossary-${termKey(entry.term)}`}
          className={help.trigger}
          aria-label={`${entry.term}: ${entry.short} Open the glossary.`}
        >
          ?
        </Link>
      </Tooltip>
    </span>
  )
}
