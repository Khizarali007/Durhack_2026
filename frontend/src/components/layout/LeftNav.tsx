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
  { label: 'Home',        to: '/',            glyph: '⌂' },
  { label: 'Market',      to: '/market',      glyph: '⇅', also: ['/stock'] },
  { label: 'Portfolio',   to: '/portfolio',   glyph: '◔' },
  { label: 'Leaders',     to: '/leaderboard', glyph: '♛' },
  { label: 'Learn',       to: '/learn',       glyph: '✎' },
  { label: 'Activity',    to: '/activity',    glyph: '↻' },
]

/** Slim icon rail, so the trading screen keeps its three columns. */
export default function LeftNav() {
  const { pathname } = useLocation()

  return (
    <nav className={styles.nav} aria-label="Main navigation" data-tour="nav">
      {NAV_ITEMS.map(({ label, to, glyph, also }) => {
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
            <span className={styles.glyph} aria-hidden="true">{glyph}</span>
            <span className={styles.label}>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
