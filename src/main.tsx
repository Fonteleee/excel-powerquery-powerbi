import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/Common/ErrorBoundary'
import { ToastHost } from './components/Common/ToastHost'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ToastHost />
    </ErrorBoundary>
  </StrictMode>,
)
