import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const StyleguidePage = lazy(() => import('./pages/StyleguidePage'))
const DebugPage = lazy(() => import('./pages/DebugPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
      </Routes>
    </BrowserRouter>
  )
}
