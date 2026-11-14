import { useState, useLayoutEffect, useCallback } from 'react'

export type Theme = 'dark' | 'light'

export interface ThemeControls {
  theme: Theme
  toggleTheme: () => void
  /** Projector mode: bigger type and higher contrast, for the demo screen. */
  projector: boolean
  toggleProjector: () => void
}

export function useTheme(): ThemeControls {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('hs-theme')
    return stored === 'light' ? 'light' : 'dark'
  })
  const [projector, setProjector] = useState<boolean>(() => localStorage.getItem('hs-projector') === 'true')

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hs-theme', theme)
  }, [theme])

  // Person 4's components read the same attribute, so it lives on <html>
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-projector', String(projector))
    localStorage.setItem('hs-projector', String(projector))
  }, [projector])

  const toggleTheme = useCallback(() => setThemeState(t => (t === 'dark' ? 'light' : 'dark')), [])
  const toggleProjector = useCallback(() => setProjector(p => !p), [])

  return { theme, toggleTheme, projector, toggleProjector }
}
