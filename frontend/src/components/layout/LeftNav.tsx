import { NavLink } from 'react-router-dom'
import styles from './LeftNav.module.css'

const NAV_ITEMS = [
  { label: 'Market',      to: '/market' },
  { label: 'Portfolio',   to: '/portfolio' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Learn',       to: '/learn' },
  { label: 'Activity',    to: '/activity' },
]

export default function LeftNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {NAV_ITEMS.map(({ label, to }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            isActive ? `${styles.link} ${styles.active}` : styles.link
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
