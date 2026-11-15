import { useSeason } from '../../api/useSeason'
import { useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarketStream, usePortfolio } from '../../api'
import { useThemeContext } from '../../context/useThemeContext'
import { formatHOOP } from '../../utils/format'
import UserMenu from './UserMenu'
import styles from './Header.module.css'

export default function Header() {
  const {score}=useSeason()
  const { connected } = useMarketStream()
  const { theme, toggleTheme } = useThemeContext()
  const { portfolio } = usePortfolio()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = searchRef.current?.value.trim()
    if (q) {
      navigate(`/market?q=${encodeURIComponent(q)}`)
      searchRef.current!.value = ''
    }
    searchRef.current?.blur()
  }

  return (
    <header className={styles.header}>
      <div className={styles.wordmark}>HoopStreet<span className="brand-dot"/></div>



      <div className={styles.right}>
        <form onSubmit={handleSearch} className={styles.searchForm} data-tour="header-search">
          <input
            ref={searchRef}
            className={styles.search}
            placeholder="Search… (Ctrl+K)"
            aria-label="Search players"
            type="search"
          />
        </form>

        <div className={styles.statBlock} data-tour="header-cash">
          <span className={styles.statLabel}>Cash</span>
          <span className={styles.statValue}>
            {portfolio != null ? formatHOOP(portfolio.cash) : '—'}
          </span>
        </div>

        <div className={styles.statBlock} data-tour="header-equity">
          <span className={styles.statLabel}>Portfolio</span>
          <span className={styles.statValue}>
            {score ? formatHOOP(score.score) : '—'}
          </span>
        </div>

        <button
          className={styles.themeBtn}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          type="button"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <div
          className={styles.dot}
          data-connected={String(connected)}
          title={connected ? 'Live' : 'Reconnecting…'}
          role="status"
          aria-label={connected ? 'Market connected' : 'Market reconnecting'}
        />

        <UserMenu />
      </div>
    </header>
  )
}
