import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Starfield } from '../components/fx'
import Scramble from '../components/Scramble'
import Sigil, { computeIdentity, RITE_COLORS } from '../components/Sigil'
import { useSanctum } from '../store'
import { questEvent, QUESTS } from '../game/quests'
import { armOnFirstGesture, chime, riser, swell, thud, staticBurst } from '../components/audio'

/* ── THE DEPARTURE ─*──────────────────────────────────────────────
   The inverse rite. You came DOWN through the Seal; you leave UP through
   the ring. A scroll journey that mirrors the arrival beat-for-beat:
     B0 — the quiet: "every frequency goes quiet eventually"
     B1 — the transmissions fold away, REVERSED (last-heard dissolves
          first, letter by letter-spacing)
     B2 — the portal opens OUTWARD past the camera (you pass through it),
          the wordmark shows, and the eyelid doors close over it
     B3 — the final still: your sigil, your rank, your name.
          THE NETWORK REMEMBERS.
   Same engine shape as the Gate (sticky stage + scroll progress), CSS
   portal only — no WebGL dependency. Guarded: the unanointed are sent
   back to the orbit.                                                      */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const io = (t: number) => t * t * (3 - 2 * t)

/* the Gate's three transmissions, in departure order (last heard first) */
const FOLD_LINES = ['WE ARE THE HCET SYNDICATE', 'A SIGNAL BENEATH THE STATIC', "YOU FEEL IT, DON'T YOU"]
const FOLD_KICKERS = ['IDENTITY DISCLOSED', 'PHASE-LOCK CONFIRMED', 'SIGNAL ACQUISITION']

export default function Ending() {
  const callsign = useSanctum((s) => s.callsign)
  const visitor = useSanctum((s) => s.visitor)
  const rank = useSanctum((s) => s.rank)
  const riteScores = useSanctum((s) => s.riteScores)
  const pathsWalked = useSanctum((s) => s.pathsWalked)
  const questsDone = useSanctum((s) => s.questsDone)
  const masterBest = useSanctum((s) => s.masterBest)

  const id = computeIdentity({ riteScores: riteScores ?? {}, pathsWalked: pathsWalked ?? [] })
  const color = RITE_COLORS[id.riteIdx]

  const b0 = useRef<HTMLDivElement>(null)
  const b1 = useRef<HTMLDivElement>(null)
  const foldRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const rings = useRef<(HTMLDivElement | null)[]>([])
  const glow = useRef<HTMLDivElement>(null)
  const wm = useRef<HTMLDivElement>(null)
  const doorT = useRef<HTMLDivElement>(null)
  const doorB = useRef<HTMLDivElement>(null)
  const still = useRef<HTMLDivElement>(null)

  const [beat, setBeat] = useState(0)
  const beatRef = useRef(0)
  const firedRef = useRef(false)
  const pRef = useRef(0)

  useEffect(() => {
    armOnFirstGesture(() => undefined)
    if (!useSanctum.getState().callsign) return // guard frame — redirect renders instead

    let raf = 0
    const apply = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? clamp01(window.scrollY / max) : 0
      pRef.current = p

      /* beat logic (audio + scramble flags ride the React commit, never the rAF) */
      const b = p < 0.3 ? 0 : p < 0.62 ? 1 : p < 0.88 ? 2 : 3
      if (b !== beatRef.current) {
        beatRef.current = b
        setBeat(b)
        if (b === 1) riser(2.2, 0.07)
        if (b === 2) swell(3.0, 0.1)
        if (b === 3) {
          thud(0.16)
          const down = [659.26, 523.25, 392, 329.63, 261.63]
          down.forEach((f, i) => window.setTimeout(() => chime(f, 1.6, 0.05), i * 170))
        }
      }

      /* ── B0 the quiet ── */
      if (b0.current)
        b0.current.style.opacity = String(seg(p, 0.015, 0.09) * (1 - seg(p, 0.24, 0.3)))

      /* ── B1 the fold — each transmission dissolves in departure order ── */
      if (b1.current)
        b1.current.style.opacity = String(seg(p, 0.31, 0.37) * (1 - seg(p, 0.56, 0.62)))
      foldRefs.current.forEach((el, i) => {
        if (!el) return
        const t = seg(p, 0.4 + i * 0.055, 0.485 + i * 0.055)
        el.style.opacity = String(1 - io(t))
        el.style.filter = `blur(${io(t) * 9}px)`
        el.style.letterSpacing = `${0.12 + io(t) * 0.55}em`
        el.style.transform = `translateY(${io(t) * -16}px)`
      })

      /* ── B2 the portal opens outward — you pass through it ── */
      const rt = io(seg(p, 0.63, 0.88))
      rings.current.forEach((el, i) => {
        if (!el) return
        const s = 0.22 + rt * (5.2 + i * 1.9)
        el.style.transform = `translate(-50%,-50%) scale(${s})`
        el.style.opacity = String(clamp01(0.9 - rt * 0.95 + 0.12 * i) * seg(p, 0.6, 0.66))
      })
      if (glow.current) {
        glow.current.style.transform = `translate(-50%,-50%) scale(${0.3 + rt * 9})`
        glow.current.style.opacity = String(0.5 * (1 - rt) * seg(p, 0.6, 0.68))
      }
      if (wm.current) {
        wm.current.style.opacity = String(seg(p, 0.68, 0.74) * (1 - seg(p, 0.84, 0.9)))
        wm.current.style.transform = `translate(-50%,-50%) scale(${1 - seg(p, 0.74, 0.88) * 0.08})`
      }
      /* eyelid doors close over the wordmark */
      const d = io(seg(p, 0.76, 0.9))
      if (doorT.current) doorT.current.style.transform = `translateY(${(-1 + d) * 52}vh)`
      if (doorB.current) doorB.current.style.transform = `translateY(${(1 - d) * 52}vh)`

      /* ── B3 the final still ── */
      if (still.current) {
        still.current.style.opacity = String(io(seg(p, 0.9, 0.965)))
        still.current.style.transform = `scale(${0.96 + io(seg(p, 0.9, 0.965)) * 0.04})`
      }

      /* the door closes behind you — once, at the very end */
      if (p >= 0.985 && !firedRef.current) {
        firedRef.current = true
        questEvent({ type: 'departed' })
        staticBurst(0.3, 0.05)
      }
      if (p < 0.9) firedRef.current = false // scrolled back up — the end can be felt again
      ;(window as unknown as { __ending?: unknown }).__ending = () => ({ p, beat: beatRef.current, fired: firedRef.current })
      raf = requestAnimationFrame(apply)
    }
    raf = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!callsign) return <Navigate to="/trials" replace />

  return (
    <div style={{ background: '#030509' }}>
      <div style={{ height: '520vh' }} />
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <Starfield density={170} />
        <p className="t-mono" style={{ position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 5, fontSize: 10, letterSpacing: '.42em', color: 'var(--ember)', whiteSpace: 'nowrap' }}>
          RITE IV · INVERSE — THE DEPARTURE
        </p>
        {beat < 3 && (
          <p className="t-mono" style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 5, fontSize: 9, letterSpacing: '.34em', color: 'var(--ghost)', opacity: 0.7, animation: 'caretBlink 2.2s steps(1) infinite', whiteSpace: 'nowrap' }}>
            ▽ SCROLL — THE WAY OUT IS UP ▽
          </p>
        )}

        {/* B0 — the quiet */}
        <div ref={b0} style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'grid', placeItems: 'center', textAlign: 'center', opacity: 0, padding: 24 }}>
          <div>
            <h1 className="t-display gt-steel" style={{ fontSize: 'clamp(24px, 4.6vw, 58px)', fontWeight: 900, letterSpacing: '.1em', lineHeight: 1.12, margin: 0 }}>
              <Scramble text="EVERY FREQUENCY GOES QUIET EVENTUALLY" charMs={22} scrambleMs={330} start={beat === 0} />
            </h1>
            <p className="t-dim" style={{ marginTop: 20, fontSize: 14, fontWeight: 300, letterSpacing: '.14em' }}>
              <Scramble text={`you came as ${visitor ?? 'a friend of the network'}. you leave as ${callsign}.`} delay={1.6} charMs={18} scrambleMs={260} start={beat === 0} />
            </p>
          </div>
        </div>

        {/* B1 — the transmissions fold away, reversed */}
        <div ref={b1} style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'grid', placeItems: 'center', textAlign: 'center', opacity: 0, padding: 24 }}>
          <div>
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.36em', color: 'var(--kyber-dim)', marginBottom: 30 }}>
              THE TRANSMISSIONS FOLD AWAY — REVERSED
            </p>
            {FOLD_LINES.map((l, i) => (
              <div key={l} style={{ margin: '22px 0' }}>
                <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ghost)', opacity: 0.75 }}>
                  TRANSMISSION 0{3 - i} — {FOLD_KICKERS[i]}
                </p>
                <p
                  ref={(el) => { foldRefs.current[i] = el }}
                  className="t-display"
                  style={{ margin: '8px 0 0', fontSize: 'clamp(18px, 3.4vw, 40px)', fontWeight: 800, letterSpacing: '.12em', color: i === 0 ? color : 'var(--bone)', willChange: 'filter, transform, opacity' }}
                >
                  {l}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* B2 — the ring opens outward past the camera */}
        <div ref={glow} aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${color}22 0%, transparent 62%)`, opacity: 0, zIndex: 3 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} ref={(el) => { rings.current[i] = el }} aria-hidden
            style={{ position: 'absolute', left: '50%', top: '50%', width: 260, height: 260, borderRadius: '50%', border: `${1.4 - i * 0.3}px solid ${i === 0 ? color : 'rgba(103,232,249,.6)'}`, opacity: 0, zIndex: 3, willChange: 'transform, opacity', boxShadow: i === 0 ? `0 0 42px ${color}44` : 'none' }} />
        ))}
        <div ref={wm} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 3, opacity: 0, textAlign: 'center', willChange: 'transform, opacity' }}>
          <h2 className="t-display gt-steel" style={{ fontSize: 'clamp(30px, 6vw, 74px)', fontWeight: 900, letterSpacing: '.14em', margin: 0 }}>PROJECT SANCTUM</h2>
          <p className="t-mono" style={{ marginTop: 12, fontSize: 10, letterSpacing: '.4em', color: 'var(--kyber-dim)' }}>YOU LEAVE THE WAY YOU CAME — THROUGH THE RING</p>
        </div>
        <div ref={doorT} aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '51vh', background: 'linear-gradient(180deg,#020306,#05080f)', transform: 'translateY(-52vh)', zIndex: 6, borderBottom: `1px solid ${color}33` }} />
        <div ref={doorB} aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '51vh', background: 'linear-gradient(0deg,#020306,#05080f)', transform: 'translateY(52vh)', zIndex: 6, borderTop: `1px solid ${color}33` }} />

        {/* B3 — the final still */}
        <div ref={still} style={{ position: 'absolute', inset: 0, zIndex: 7, display: 'grid', placeItems: 'center', textAlign: 'center', opacity: 0, pointerEvents: beat === 3 ? 'auto' : 'none', padding: 24, background: 'radial-gradient(ellipse 72% 56% at 50% 50%, rgba(3,5,9,.94), transparent 76%)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Sigil total={id.total} riteIdx={id.riteIdx} leanIdx={id.leanIdx} size={92} />
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.42em', color: 'var(--ghost)' }}>THE NETWORK REMEMBERS</p>
            <h2 className="t-display" style={{ margin: 0, fontSize: 'clamp(34px, 7vw, 84px)', fontWeight: 900, letterSpacing: '.2em', color, textShadow: `0 0 40px ${color}55` }}>{callsign}</h2>
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.3em', color: 'var(--kyber)' }}>{(rank ?? id.rank).toUpperCase()} OF THE NETWORK</p>
            <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.26em', color: 'var(--ghost)', opacity: 0.85 }}>
              ECHO {id.total}/9 · QUESTS {questsDone.length}/{QUESTS.length} · MASTER BAND ×{masterBest || '—'}
            </p>
            <div style={{ margin: '10px 0', height: 1, width: 200, background: `linear-gradient(90deg, transparent, ${color}66, transparent)` }} />
            <p className="t-mono" style={{ fontSize: 11, letterSpacing: '.5em', color: 'var(--bone)' }}>END OF TRANSMISSION</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              <Link to="/trials" data-cursor="RETURN"
                style={{ padding: '12px 30px', border: `1px solid ${color}88`, color, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.3em', textDecoration: 'none', borderRadius: 4, transition: 'all .3s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = `${color}14` }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}>
                RETURN TO THE ORBIT
              </Link>
              <Link to="/" data-cursor="RETURN"
                style={{ padding: '12px 30px', border: '1px solid rgba(103,232,249,.3)', color: 'var(--kyber-dim)', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.3em', textDecoration: 'none', borderRadius: 4, transition: 'all .3s' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--kyber)'; e.currentTarget.style.color = 'var(--kyber)' }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(103,232,249,.3)'; e.currentTarget.style.color = 'var(--kyber-dim)' }}>
                THE GATE REMEMBERS THE WAY
              </Link>
            </div>
            <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ghost)', opacity: 0.7 }}>
              THE SURFACE WAITS BEHIND <span style={{ color: 'var(--ember)' }}>~</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
