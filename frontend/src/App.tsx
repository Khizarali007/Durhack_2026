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
import StockPage from './pages/StockPage'

const StyleguidePage = lazy(() => import('./pages/StyleguidePage'))
const DebugPage = lazy(() => import('./pages/DebugPage'))

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

            {/* Shell routes */}
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="portfolio" element={<PortfolioPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="learn" element={<LearnPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="stock/:symbol" element={<StockPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </ThemeProvider>
  )
}
