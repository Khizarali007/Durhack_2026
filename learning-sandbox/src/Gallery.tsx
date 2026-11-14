// Component-states gallery for Person 3's review: every learning component in
// each state. The page shows the same gallery twice, in a dark and a light
// iframe side by side, so both themes can be checked at once.
import { useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FeedItem, MissionDebriefView, MissionList, MissionPanel } from '@/components/learning'
import { Card } from '@/components/ui'
import { FEED_SAMPLES, MISSIONS, RESULTS, STATES } from './fixtures'
import styles from './Gallery.module.css'

function Item({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.item}>
      <h3 className={`label ${styles.itemTitle}`}>{title}</h3>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </section>
  )
}

/** All states, in whatever theme the document has. */
export function StatesGallery() {
  const next = MISSIONS[1]
  return (
    <div className={styles.gallery}>
      <h2 className={styles.groupTitle}>MissionPanel</h2>
      <Item title="Idle" note="Nothing played yet. Mission 1 ready, 2-6 locked.">
        <MissionPanel userId="demo" mission={STATES.idle} />
      </Item>
      <Item title="Running, with hints" note="6 s in: coach's tip arrived, hint button open on click.">
        <MissionPanel userId="demo" mission={STATES.runningHints} />
      </Item>
      <Item title="Hot-streak alert, last 10 seconds" note="Heat advisory in the feed; the timer turns red under 10 s.">
        <MissionPanel userId="demo" mission={STATES.hotStreak} />
      </Item>
      <Item title="Passed" note="Mission 1 shows the Passed pill in the list.">
        <MissionPanel userId="demo" mission={STATES.passed} />
      </Item>
      <Item title="Backend down" note="Socket reconnecting, error shown inline.">
        <MissionPanel userId="demo" mission={STATES.offline} />
      </Item>
      <Item title="Projector" note="projector prop: one step up the type scale, muted text raised to primary.">
        <MissionPanel userId="demo" mission={STATES.hotStreak} projector />
      </Item>

      <h2 className={styles.groupTitle}>MissionList</h2>
      <Item title="Live, passed, ready, locked" note="Row 1 selected (accent border), 2-6 locked.">
        <Card padding="none">
          <MissionList
            missions={MISSIONS}
            selectedId={MISSIONS[0].id}
            activeId={MISSIONS[0].id}
            activeState="running"
            onSelect={() => undefined}
          />
          <MissionList
            missions={MISSIONS.slice(0, 1)}
            selectedId={null}
            passedIds={new Set([MISSIONS[0].id])}
            onSelect={() => undefined}
          />
        </Card>
      </Item>

      <h2 className={styles.groupTitle}>FeedItem</h2>
      <Item title="Every event kind and line type">
        <Card padding="none">
          <ul className={styles.feed}>
            {FEED_SAMPLES.map((m) => (
              <FeedItem key={m.seq} msg={m} />
            ))}
          </ul>
        </Card>
      </Item>

      <h2 className={styles.groupTitle}>MissionDebriefView</h2>
      <Item title="Passed (great)">
        <MissionDebriefView result={RESULTS.passed_great} entry={MISSIONS[0]} nextMission={null} onRetry={() => undefined} onClose={() => undefined} />
      </Item>
      <Item title="Passed (ok), next mission available" note="Next is enabled when a later mission is available.">
        <MissionDebriefView
          result={RESULTS.passed_ok}
          entry={MISSIONS[0]}
          nextMission={{ ...next, available: true }}
          onRetry={() => undefined}
          onNext={() => undefined}
        />
      </Item>
      <Item title="Failed: never bought">
        <MissionDebriefView result={RESULTS.never_bought} entry={MISSIONS[0]} onRetry={() => undefined} onClose={() => undefined} />
      </Item>
      <Item title="Failed: sold at a loss">
        <MissionDebriefView result={RESULTS.sold_at_loss} entry={MISSIONS[0]} onRetry={() => undefined} />
      </Item>
      <Item title="Stopped early, still holding">
        <MissionDebriefView result={RESULTS.stopped} entry={MISSIONS[0]} onRetry={() => undefined} />
      </Item>
    </div>
  )
}

/** Rendered inside each iframe: sets its own theme and reports its height. */
export function GalleryFrame({ theme }: { theme: 'dark' | 'light' }) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  useEffect(() => {
    const post = () => window.parent.postMessage({ hsGalleryHeight: document.body.scrollHeight, theme }, '*')
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    post()
    return () => ro.disconnect()
  }, [theme])
  return (
    <div className={styles.frameBody}>
      <StatesGallery />
    </div>
  )
}

/** Dark and light side by side (stacked on a phone). */
export function GalleryPage() {
  const [heights, setHeights] = useState<Record<string, number>>({})
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { hsGalleryHeight?: number; theme?: string } | null
      if (e.origin !== window.location.origin || !data?.hsGalleryHeight || !data.theme) return
      const { hsGalleryHeight, theme } = data
      setHeights((h) => (h[theme] === hsGalleryHeight ? h : { ...h, [theme]: hsGalleryHeight }))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Every learning component in each state, using fixture data (no backend needed). Left: dark theme. Right: light
        theme.
      </p>
      <div className={styles.frames}>
        {(['dark', 'light'] as const).map((theme) => (
          <div key={theme} className={styles.frameCol}>
            <span className="label">{theme} theme</span>
            <iframe
              className={styles.frame}
              title={`Learning components, ${theme} theme`}
              src={`?frame=states&theme=${theme}`}
              style={{ height: heights[theme] ? `${heights[theme]}px` : '80vh' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
