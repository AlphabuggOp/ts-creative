import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Cursor, Grain } from './components/fx'
import FieldLog from './components/FieldLog'
import Toasts from './components/Toasts'
import CoverBlog from './cover/CoverBlog'
import Gate from './routes/Gate'
import Trials from './routes/Trials'
import Ceremony from './routes/Ceremony'
import Ending from './routes/Ending'
import { useSanctum } from './store'
import { questEvent } from './game/quests'
import { chime } from './components/audio'

/* ── THE TWO LAYERS ──────────────────────────────────────────────────
   The blog (cover) sits in front of the Sanctum. Before the visitor
   finds the door, the cover is AIRTIGHT: no custom cursor, no grain
   chrome, no panic key, nothing. After discovery:
     · the layer remembers (store.found) and boots straight inside
     · `~` toggles blog ⇄ sanctum with a static wipe (q-panic)
     · Ctrl+Alt+D wipes the save (hidden demo reset)                    */

function StaticWipe({ active }: { active: boolean }) {
  return (
    <div
      data-static-wipe={active ? '1' : '0'}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 400, pointerEvents: 'none',
        opacity: active ? 1 : 0, transition: 'opacity .32s steps(5)',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundColor: 'rgba(6,9,14,.86)',
        animation: active ? 'caretBlink .12s steps(1) infinite' : 'none',
      }}
    />
  )
}

export default function App() {
  const [cover, setCover] = useState(() => !useSanctum.getState().found)
  const [wiping, setWiping] = useState(false)

  /* keep body cursor-mode in sync; zero re-render cost */
  useEffect(() => {
    document.body.classList.toggle('cover-mode', cover)
    return () => document.body.classList.remove('cover-mode')
  }, [cover])

  const wipeTo = (showCover: boolean, after?: () => void) => {
    if (wiping) return
    setWiping(true)
    window.setTimeout(() => {
      setCover(showCover)
      /* SCROLL LAW — entering the Sanctum must start the Gate at the TOP:
         the cover scrolls (photos page!), an unreset scrollY lands you
         mid-journey. Reset in the same commit as the layer swap. */
      if (!showCover) window.scrollTo(0, 0)
      after?.()
      window.setTimeout(() => setWiping(false), 260)
    }, 360)
  }

  const unlock = (name: string) => {
    useSanctum.getState().setFound(name)
    wipeTo(false)
  }

  /* global keys: `~` panic toggle (only after discovery) + Ctrl+Alt+D wipe */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === 'd')) {
        e.preventDefault()
        localStorage.clear()
        window.location.reload()
        return
      }
      if (!useSanctum.getState().found) return
      if (e.key === '`' || e.key === '~') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        if (wiping) return
        questEvent({ type: 'panic' })
        chime(220, 0.6, 0.05)
        wipeTo(!cover)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover, wiping])

  return (
    <BrowserRouter>
      <StaticWipe active={wiping} />
      {cover ? (
        <CoverBlog onUnlock={unlock} />
      ) : (
        <>
          <Grain />
          <Cursor />
          <FieldLog />
          <Toasts />
          <Routes>
            <Route path="/" element={<Gate />} />
            <Route path="/trials" element={<Trials />} />
            <Route path="/ceremony" element={<Ceremony />} />
            <Route path="/ending" element={<Ending />} />
            <Route path="*" element={<Gate />} />
          </Routes>
        </>
      )}
    </BrowserRouter>
  )
}
