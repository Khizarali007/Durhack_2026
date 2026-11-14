import { createContext, useContext } from 'react'
import type { ThemeControls } from '../hooks/useTheme'

export const ThemeContext = createContext<ThemeControls | null>(null)

export function useThemeContext(): ThemeControls {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext used outside ThemeProvider')
  return ctx
}
