import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError, joinAsGuest, loginUser, signupUser, useSession } from '../api'
import { Button, Card, Input, Tabs } from '../components/ui'
import '../components/season.css'
import '../components/Onboarding.css'
import styles from './LoginPage.module.css'

type Mode = 'login' | 'signup'

const USERNAME_RULE = /^[A-Za-z0-9_-]{3,20}$/

/** Same rules as the backend (trading/router.py CredentialsIn), checked before sending. */
function validate(username: string, password: string): { username?: string; password?: string } {
  const errors: { username?: string; password?: string } = {}
  if (!USERNAME_RULE.test(username)) errors.username = '3–20 letters, digits, _ or -'
  if (password.length < 6) errors.password = 'At least 6 characters'
  return errors
}

function messageFor(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'That username is taken. Try another one.'
    if (err.status === 401) return 'Wrong username or password.'
    if (err.status === 422) return 'Check the username and password rules above.'
  }
  return mode === 'login'
    ? "Couldn't log in. Is the server running? Try again in a moment."
    : "Couldn't create the account. Try again in a moment."
}

/** The way in: log in, sign up, or one tap into a guest account. */
export default function LoginPage() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'form' | 'guest' | null>(null)
  const [error, setError] = useState('')

  if (!loading && session) return <Navigate to="/" replace />

  const errors = touched ? validate(username, password) : {}

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(validate(username, password)).length > 0) return
    setBusy('form')
    setError('')
    try {
      if (mode === 'login') await loginUser(username, password)
      else await signupUser(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(messageFor(err, mode))
    } finally {
      setBusy(null)
    }
  }

  async function guest() {
    setBusy('guest')
    setError('')
    try {
      await joinAsGuest()
      navigate('/', { replace: true })
    } catch {
      setError("Couldn't start a guest account. Is the server running? Try again in a moment.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className={`onboarding-page ${styles.page}`}>
      <div className="onboarding-brand">
        HoopStreet<span>2024–25 virtual season</span>
      </div>
      <div className="draft-heading">
        <div>
          <h1>Welcome to HoopStreet</h1>
          <p>Every NBA player is a share. Start with H$100 of play money, build a roster and follow the season week by week.</p>
        </div>
      </div>
      <Card raised padding="lg" className={styles.card}>
        <Button variant="primary" size="lg" fullWidth onClick={() => void guest()} disabled={busy !== null}>
          {busy === 'guest' ? 'Starting…' : 'Play as guest'}
        </Button>
        <p className={styles.hint}>No sign-up needed. You can save your progress later from the menu.</p>

        <div className={styles.divider} role="separator">
          <span>or use an account</span>
        </div>

        <Tabs
          tabs={[
            { label: 'Log in', value: 'login' },
            { label: 'Sign up', value: 'signup' },
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v as Mode)
            setError('')
            setTouched(false)
          }}
        />

        <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
            autoComplete="username"
            name="username"
            placeholder="e.g. hoops_fan"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            name="password"
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="ghost" size="lg" fullWidth disabled={busy !== null}>
            {busy === 'form' ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>

        <p className={styles.footnote}>Play money only. A replay of the real 2024–25 season.</p>
      </Card>
    </main>
  )
}
