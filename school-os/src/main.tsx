import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './glass.css'
import App from './App.tsx'
import { VerifyApp } from './pages/verify'
import { initPwa } from './lib/pwa'

initPwa()

// Public QR verification boot mode: /verify/<token> renders outside the
// role workspace (hosting must fall back to index.html for /verify/*).
const verifyMatch = window.location.pathname.match(/^\/verify\/([^/]+)\/?$/)
if (verifyMatch) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <VerifyApp token={decodeURIComponent(verifyMatch[1])} />
    </StrictMode>,
  )
} else {

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
}
