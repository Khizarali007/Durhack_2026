import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { SessionProvider } from './context/SessionContext'
import AppShell from './components/layout/AppShell'
import HomePage from './pages/HomePage'
import MarketPage from './pages/MarketPage'
import PortfolioPage from './pages/PortfolioPage'
import LeaderboardPage from './pages/LeaderboardPage'
import LearnPage from './pages/LearnPage'
import ActivityPage from './pages/ActivityPage'
import LoginPage from './pages/LoginPage'
import FriendsPage from './pages/FriendsPage'
import RivalPage from './pages/RivalPage'

// The trading screen pulls in the chart library, so it loads as its own chunk
const StockPage = lazy(() => import('./pages/StockPage'))
const StyleguidePage = lazy(() => import('./pages/StyleguidePage'))
const DebugPage = lazy(() => import('./pages/DebugPage'))
const DirectorPage = lazy(() => import('./pages/DirectorPage'))

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            {/* Dev-only pages — no shell */}
            <Route
              path="/styleguide"
              element={
                <Suspense fallback={null}>
                  <StyleguidePage />
                </Suspense>
              }
            />
            <Route
              path="/debug"
              element={
                <Suspense fallback={null}>
                  <DebugPage />
                </Suspense>
              }
            />

            <Route path="/login" element={<LoginPage />} />

            {/* Shell routes */}
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="portfolio" element={<PortfolioPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="learn" element={<LearnPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="friends" element={<FriendsPage />} />
              <Route path="friends/:id" element={<RivalPage />} />
              {/* Demo controls: deliberately not in the nav */}
              <Route path="director" element={<Suspense fallback={null}><DirectorPage /></Suspense>} />
              <Route
                path="stock/:symbol"
                element={
                  <Suspense fallback={<div className="skeleton" style={{ flex: 1, margin: 'var(--hs-space-4)' }} />}>
                    <StockPage />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </ThemeProvider>
  )
}
