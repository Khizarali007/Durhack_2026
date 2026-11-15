import { NavLink, useLocation } from 'react-router-dom'
import styles from './LeftNav.module.css'

interface NavItem {
  label: string
  to: string
  glyph: string
  /** Other path prefixes that should light this item up. */
  also?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',        to: '/',            glyph: '⌂' },
  { label: 'Market',      to: '/market',      glyph: '⇅', also: ['/stock'] },
  { label: 'Portfolio',   to: '/portfolio',   glyph: '◔' },
  { label: 'Leaders',     to: '/leaderboard', glyph: '♛' },
  { label: 'Learn',       to: '/learn',       glyph: '✎' },
  { label: 'Activity',    to: '/activity',    glyph: '↻' },
]

const ICONS: Record<string,string> = {
 Overview:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
 Market:'M4 17 9 12l4 3 7-10M15 5h5v5',
 Portfolio:'M4 7h16v13H4zM9 7V4h6v3M4 12h16M10 12v3h4v-3',
 Leaders:'M5 20v-7h4v7M10 20V5h4v15M15 20v-11h4v11',
 Learn:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15',
 Activity:'M3 12h4l3-8 4 16 3-8h4',
}

/** Slim icon rail, so the trading screen keeps its three columns. */
export default function LeftNav() {
  const { pathname } = useLocation()

  return (
    <nav className={styles.nav} aria-label="Main navigation" data-tour="nav">
      {NAV_ITEMS.map(({ label, to, also }) => {
        const alsoActive = also?.some(prefix => pathname.startsWith(prefix)) ?? false
        return (
          <NavLink
            key={to}
            to={to}
            data-tour={`nav-${label.toLowerCase()}`}
            end={to === '/'}
            className={({ isActive }) =>
              isActive || alsoActive ? `${styles.link} ${styles.active}` : styles.link
            }
          >
            <svg className={styles.glyph} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[label]}/></svg>
            <span className={styles.label}>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
