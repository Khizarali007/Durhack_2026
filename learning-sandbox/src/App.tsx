// THROWAWAY TEST SCAFFOLDING for Person 4's learning components.
// Pages: ?page=floor (default, live against the dev backend) and
// ?page=states (component gallery, both themes). ?frame=states is the
// gallery's iframe content.
import { useState } from 'react'
import { DEFAULT_API_BASE } from '@/api/learning'
import { useMission } from '@/components/learning'
import { Button, Pill, Tabs } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { GalleryFrame, GalleryPage } from './Gallery'
import { TradingFloor } from './TradingFloor'
import styles from './App.module.css'

const API_BASE: string = import.meta.env.VITE_LEARNING_API || DEFAULT_API_BASE
const params = new URLSearchParams(window.location.search)

type Page = 'floor' | 'states'

function Shell() {
  const { theme, toggleTheme } = useTheme()
  const [page, setPage] = useState<Page>(params.get('page') === 'states' ? 'states' : 'floor')
  const [projector, setProjector] = useState(false)
  const [userId] = useState(() => `guest_${Math.random().toString(36).slice(2, 8)}`)
  const mission = useMission({ apiBase: API_BASE, userId, enabled: page === 'floor' })

  const go = (value: string) => {
    const next: Page = value === 'states' ? 'states' : 'floor'
    setPage(next)
    window.history.replaceState(null, '', next === 'floor' ? window.location.pathname : `?page=${next}`)
  }

  return (
    <div className={styles.app} data-projector={projector ? 'true' : undefined}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>HoopStreet</span>
          <Pill variant="neutral">Learning sandbox · test only</Pill>
        </div>
        <nav className={styles.nav} aria-label="Sandbox pages">
          <Tabs
            tabs={[
              { label: 'Trading floor', value: 'floor' },
              { label: 'Component states', value: 'states' },
            ]}
            value={page}
            onChange={go}
          />
        </nav>
        <div className={styles.tools}>
          {page === 'floor' && (
            <span className={styles.user}>
              <span className="num">{userId}</span>
              <Pill variant={mission.connection === 'open' ? 'accent' : 'down'}>
                {mission.connection === 'open' ? 'Live' : mission.connection}
              </Pill>
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setProjector((p) => !p)}>
            Projector {projector ? 'on' : 'off'}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        {page === 'floor' && mission.error && (
          <p className={styles.banner} role="alert">
            Backend: {mission.error}. Is backend/learning/dev_app.py running on {API_BASE}?
          </p>
        )}
        {page === 'floor' ? <TradingFloor apiBase={API_BASE} userId={userId} mission={mission} /> : <GalleryPage />}
      </main>
    </div>
  )
}

export default function App() {
  if (params.get('frame') === 'states') {
    return <GalleryFrame theme={params.get('theme') === 'light' ? 'light' : 'dark'} />
  }
  return <Shell />
}
