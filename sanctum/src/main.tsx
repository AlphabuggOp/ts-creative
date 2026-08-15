import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/space-grotesk/300.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './design/tokens.css'

// harden typography: start fetching display/UI faces BEFORE first paint
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.load('700 90px Cinzel', 'SANCTUM')
  document.fonts.load('900 120px Cinzel', 'SANCTUM')
  document.fonts.load('400 14px "Space Grotesk"', 'a')
  document.fonts.load('500 13px "IBM Plex Mono"', 'a')
}

createRoot(document.getElementById('root')!).render(<App />)
