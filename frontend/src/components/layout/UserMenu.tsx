import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, logoutUser, saveProgress, useSession } from '../../api'
import { useThemeContext } from '../../context/useThemeContext'
import { Button, Input, Pill } from '../ui'
import styles from './UserMenu.module.css'

function initialsOf(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'G'
}

/** Header account button: who you are, "Save your progress" for guests, projector mode, log out. */
export default function UserMenu() {
  const { me } = useSession()
  const { projector, toggleProjector } = useThemeContext()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!me) return null
  const isGuest = me.is_guest
  const name = me.username ?? `Guest ${me.user_id.slice(-4)}`

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
      setError('Username: 3–20 letters, digits, _ or -')
      return
    }
    if (password.length < 6) {
      setError('Password: at least 6 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveProgress(username, password)
      setSaving(false)
      setPassword('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'That username is taken.' : "Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function logOut() {
    setOpen(false)
    await logoutUser()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-tour="header-user"
      >
        <span className={styles.avatar} aria-hidden="true">{initialsOf(name)}</span>
        <span className={styles.name}>{name}</span>
        {isGuest && <Pill variant="neutral">Guest</Pill>}
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Account">
          <div className={styles.who}>
            <span className={styles.whoName}>{name}</span>
            <span className={styles.whoNote}>
              {isGuest ? 'Guest account: progress is kept on this server only.' : 'Signed in. Your account survives restarts.'}
            </span>
          </div>

          {isGuest && !saving && (
            <Button variant="primary" fullWidth onClick={() => setSaving(true)}>
              Save your progress
            </Button>
          )}
          {isGuest && saving && (
            <form className={styles.save} onSubmit={(e) => void save(e)} noValidate>
              <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <Button type="submit" variant="primary" fullWidth disabled={busy}>
                {busy ? 'Saving…' : 'Save account'}
              </Button>
            </form>
          )}

          <button type="button" role="menuitemcheckbox" aria-checked={projector} className={styles.item} onClick={toggleProjector}>
            <span>Projector mode</span>
            <span className={styles.state}>{projector ? 'On' : 'Off'}</span>
          </button>
          <button type="button" role="menuitem" className={styles.item} onClick={() => void logOut()}>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
