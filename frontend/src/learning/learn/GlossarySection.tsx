import { useMemo, useState } from 'react'
import { Input } from '../../components/ui'
import { GLOSSARY, termKey } from '../content'
import { tutorialForTerm } from '../tour/tutorials'
import styles from './learn.module.css'

/** Every term from content/glossary.json, searchable, each linked to the tutorial that teaches it. */
export function GlossarySection() {
  const [query, setQuery] = useState('')
  const terms = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GLOSSARY
    return GLOSSARY.filter((t) => t.term.toLowerCase().includes(q) || t.short.toLowerCase().includes(q))
  }, [query])

  return (
    <section className={styles.section} aria-labelledby="learn-glossary" id="glossary">
      <div className={styles.sectionHead}>
        <h2 id="learn-glossary" className={styles.sectionTitle}>
          Glossary
        </h2>
        <span className={`num ${styles.count}`}>
          {terms.length} of {GLOSSARY.length} terms
        </span>
      </div>
      <div className={styles.search}>
        <Input label="Search the glossary" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. spread" />
      </div>
      {terms.length === 0 ? (
        <p className={styles.muted}>No term matches “{query}”. Try a shorter word.</p>
      ) : (
        <dl className={styles.glossary}>
          {terms.map((t) => {
            const taughtIn = tutorialForTerm(t.term)
            return (
              <div key={t.term} id={`glossary-${termKey(t.term)}`} className={styles.term}>
                <dt>{t.term}</dt>
                <dd>
                  {t.short}
                  {taughtIn && (
                    <a className={styles.termLink} href={`#tutorial-${taughtIn.id}`}>
                      {taughtIn.comingSoon ? 'Coming in' : 'Learn it in'}: {taughtIn.title}
                    </a>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}
