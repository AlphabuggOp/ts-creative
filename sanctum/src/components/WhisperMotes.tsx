import { useEffect, useRef, useState } from 'react'
import { useSanctum } from '../store'
import { questEvent, useToasts } from '../game/quests'
import { chime, staticBurst } from './audio'

/* THE WHISPERS — three tiny voices hidden in the Gate's scroll journey.
   They blink only while their p-window is on screen; catching one is a
   quest step. Also witnesses "read everything" at journey's end.
   Self-contained progress reader — zero changes to Gate's verified core. */

const MOTES = [
  { id: 'm1', lo: 0.15, hi: 0.27, left: '7%', top: '62%' },
  { id: 'm2', lo: 0.46, hi: 0.6, left: '88%', top: '30%' },
  { id: 'm3', lo: 0.7, hi: 0.84, left: '10%', top: '26%' },
]
const READ_AT = 0.985

export default function WhisperMotes() {
  const found = useSanctum((s) => s.motesFound)
  const findMote = useSanctum((s) => s.findMote)
  const read = useSanctum((s) => s.transmissionsRead)
  const setRead = useSanctum((s) => s.setTransmissionsRead)
  const [p, setP] = useState(0)
  const readFired = useRef(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        setP(max > 0 ? window.scrollY / max : 0)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!read && !readFired.current && p >= READ_AT) {
      readFired.current = true
      setRead()
      questEvent({ type: 'read' })
    }
  }, [p, read, setRead])

  const catchMote = (id: string) => {
    if (found.includes(id)) return
    findMote(id)
    staticBurst(0.3, 0.06)
    chime(1567.98, 1.1, 0.06)
    const n = found.length + 1
    useToasts.getState().push({ title: 'A WHISPER HEARD', sub: `${n} of 3 — the Gate notices who listens` })
    questEvent({ type: 'motes' })
  }

  return (
    <>
      {MOTES.filter((m) => !found.includes(m.id) && p >= m.lo && p <= m.hi).map((m) => (
        <button
          key={m.id}
          data-mote={m.id}
          data-cursor="?"
          aria-label="a whisper"
          onClick={() => catchMote(m.id)}
          style={{
            position: 'fixed', left: m.left, top: m.top, zIndex: 66,
            width: 34, height: 34, background: 'transparent', border: 'none', cursor: 'none',
            display: 'grid', placeItems: 'center',
          }}
        >
          <span style={{
            width: 7, height: 7, transform: 'rotate(45deg)',
            background: 'var(--kyber)', boxShadow: '0 0 14px var(--kyber), 0 0 36px rgba(103,232,249,.5)',
            animation: 'caretBlink 1.15s steps(1) infinite',
          }} />
        </button>
      ))}
    </>
  )
}
