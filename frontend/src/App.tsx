import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const StyleguidePage = lazy(() => import('./pages/StyleguidePage'))

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
      </Routes>
    </BrowserRouter>
  )
}
