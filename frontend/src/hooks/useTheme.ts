import { useState, useLayoutEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('hs-theme')
    return stored === 'light' ? 'light' : 'dark'
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hs-theme', theme)
  }, [theme])

  const toggleTheme = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
