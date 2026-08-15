import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import gsap from 'gsap'
import { Starfield } from '../components/fx'
import Scramble from '../components/Scramble'
import Sigil, { computeIdentity, RITE_COLORS } from '../components/Sigil'
import { useSanctum } from '../store'
import { questEvent } from '../game/quests'
import { armOnFirstGesture, chime, blip, riser, impact, swell } from '../components/audio'

/* ── THE CEREMONY ─*───────────────────────────────────────────────
   When all three rites are cleared, the order stops testing and starts
   RECORDING. One screen, five beats, no scrolling:
     0 WEIGHED   — the archive opens its hand (scramble line)
     1 SIGIL     — the mark blooms, one arc per echo earned (chime ladder)
     2 RANK      — rank slams in with an impact + flash (0–9 echo scale)
     3 CALLSIGN  — a name minted from dominant rite × path lean scrambles
                   into place; identity persists + q-anointed seals HERE
     4 ANOINTED  — flourish + the ways back out
   Re-runnable; an existing callsign is never re-minted (the registry
   holds), but a better record promotes the rank.                          */

const BEAT_HOLD = [3.0, 2.6, 2.4, 2.6] // seconds each auto-beat holds before advancing

export default function Ceremony() {
  const root = useRef<HTMLDivElement>(null)
  const flashEl = useRef<HTMLDivElement>(null)
  const rankEl = useRef<HTMLHeadingElement>(null)
  const minted = useRef(false)

  const trialsDone = useSanctum((s) => s.trialsDone)
  const riteScores = useSanctum((s) => s.riteScores)
  const pathsWalked = useSanctum((s) => s.pathsWalked)
  const registryCallsign = useSanctum((s) => s.callsign)

  const allDone = RITE_EVERY(trialsDone)
  const id = useMemo(() => computeIdentity({ riteScores, pathsWalked }), [riteScores, pathsWalked])
  const callsign = registryCallsign ?? id.callsign
  const color = RITE_COLORS[id.riteIdx]

  const [phase, setPhase] = useState(0)

  /* beat engine — every beat holds, then advances; PRESS THROUGH skips the hold */
  useEffect(() => {
    if (!allDone || phase >= 4) return

    /* beat entrances: sound + motion fire on the REACT COMMIT, never mid-render */
    if (phase === 0) {
      riser(2.9, 0.1)
    } else if (phase === 1) {
      const ladder = [261.63, 329.63, 392, 523.25, 659.26]
      ladder.forEach((f, i) => window.setTimeout(() => chime(f, 1.3, 0.045), i * 150))
    } else if (phase === 2) {
      riser(0.9, 0.09)
      if (rankEl.current) {
        gsap.fromTo(rankEl.current,
          { scale: 3.1, opacity: 0, filter: 'blur(16px)' },
          {
            scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.62, ease: 'power4.in',
            onComplete: () => {
              impact(0.34)
              if (flashEl.current) gsap.fromTo(flashEl.current, { opacity: 0.85 }, { opacity: 0, duration: 0.5, ease: 'power2.out' })
              if (root.current) gsap.fromTo(root.current, { x: 0 }, { x: 7, duration: 0.05, repeat: 7, yoyo: true, ease: 'power1.inOut', clearProps: 'x' })
            },
          })
      }
    } else if (phase === 3) {
      /* THE MINT — identity is recorded the instant the name appears */
      if (!minted.current) {
        minted.current = true
        useSanctum.getState().setIdentity(id.rank, callsign)
        questEvent({ type: 'anointed' })
      }
      for (let i = 0; i < 6; i++) window.setTimeout(() => blip(i % 2 === 0), i * 90)
    }
    ;(window as unknown as { __ceremony?: unknown }).__ceremony = () => ({
      phase, rank: id.rank, callsign, total: id.total,
      riteIdx: id.riteIdx, leanIdx: id.leanIdx,
    })

    const t = window.setTimeout(() => setPhase((p) => Math.min(p + 1, 4)), BEAT_HOLD[phase] * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, allDone])

  useEffect(() => {
    if (phase === 4) {
      swell(2.4, 0.14)
      chime(784, 1.8, 0.06)
      window.setTimeout(() => chime(1175, 2.2, 0.045), 260)
      ;(window as unknown as { __ceremony?: unknown }).__ceremony = () => ({
        phase: 4, rank: id.rank, callsign, total: id.total, riteIdx: id.riteIdx, leanIdx: id.leanIdx,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => { armOnFirstGesture(() => undefined) }, [])

  if (!allDone) return <Navigate to="/trials" replace />

  return (
    <div ref={root} style={{ minHeight: '100vh', background: '#04060c', position: 'relative', overflow: 'hidden' }}>
      <Starfield density={180} />
      {/* impact flash — plain translucent plane (no blend modes; cursor rides above at z-200) */}
      <div ref={flashEl} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', opacity: 0, background: 'rgba(232,230,223,.9)' }} />

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
        <p className="t-mono" style={{ fontSize: 11, letterSpacing: '.42em', color: 'var(--ember)' }}>
          THE ORDER RECORDS — THE CEREMONY
        </p>

        {/* BEAT 0 — WEIGHED */}
        {phase === 0 && (
          <div style={{ marginTop: 34 }}>
            <h1 className="t-display gt-steel" style={{ fontSize: 'clamp(26px, 5vw, 62px)', fontWeight: 900, letterSpacing: '.1em', lineHeight: 1.1 }}>
              <Scramble text="ALL THAT YOU WALKED — WEIGHED" charMs={26} scrambleMs={360} />
            </h1>
            <p className="t-dim" style={{ marginTop: 18, fontSize: 14, fontWeight: 300, letterSpacing: '.12em' }}>
              <Scramble text="the archive opens its hand." delay={1.3} charMs={20} scrambleMs={260} />
            </p>
          </div>
        )}

        {/* BEAT 1+ — the SIGIL, one arc per echo earned */}
        {phase >= 1 && (
          <div style={{ marginTop: 18 }}>
            <div className="cer-sigil"><Sigil total={id.total} riteIdx={id.riteIdx} leanIdx={id.leanIdx} size={214} animate={phase === 1} /></div>
            {phase === 1 && (
              <p className="t-dim" style={{ marginTop: 20, fontSize: 12.5, letterSpacing: '.22em', fontWeight: 300 }}>
                <Scramble text={`THE ORDER SHAPES YOUR MARK — ${id.total} ECHO${id.total === 1 ? '' : 'ES'} IN THE RECORD`} charMs={14} scrambleMs={220} />
              </p>
            )}
          </div>
        )}

        {/* BEAT 2+ — the RANK */}
        {phase >= 2 && (
          <div style={{ marginTop: 18 }}>
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.34em', color: 'var(--ghost)' }}>
              RANK ECHO {id.total}/9 · THE ORDER RECORDS
            </p>
            <h2 ref={rankEl} className="t-display gt-steel" style={{ margin: '10px 0 0', fontSize: 'clamp(34px, 8.4vw, 104px)', fontWeight: 900, letterSpacing: '.12em', lineHeight: 1, opacity: 0 }}>
              {id.rank.toUpperCase()}
            </h2>
          </div>
        )}

        {/* BEAT 3+ — the CALLSIGN */}
        {phase >= 3 && (
          <div style={{ marginTop: 20 }}>
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.34em', color: 'var(--ghost)' }}>YOU WILL BE CALLED —</p>
            <h3 className="t-display" style={{ margin: '8px 0 0', fontSize: 'clamp(30px, 6.4vw, 76px)', fontWeight: 900, letterSpacing: '.2em', color, textShadow: `0 0 34px ${color}55` }}>
              <Scramble text={callsign} delay={0.25} charMs={70} scrambleMs={420} />
            </h3>
          </div>
        )}

        {/* BEAT 4 — ANOINTED */}
        {phase >= 4 && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <p className="t-dim" style={{ fontSize: 15, fontWeight: 300, letterSpacing: '.14em' }}>
              <Scramble text={`RISE, ${callsign}. THE ORDER REMEMBERS.`} charMs={22} scrambleMs={300} />
            </p>
            <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.3em', color: 'var(--ghost)', opacity: 0.8 }}>
              THE FIELD LOG CARRIES YOUR NAME NOW· THE GATE WILL GREET YOU BY IT
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link to="/trials" data-cursor="RETURN" onMouseEnter={() => blip(true)}
                style={{ padding: '13px 34px', border: `1px solid ${color}88`, color, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', textDecoration: 'none', borderRadius: 4, transition: 'all .3s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = `${color}14` }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}>
                RETURN TO THE ORBIT
              </Link>
              <Link to="/" data-cursor="RETURN" onMouseEnter={() => blip(false)}
                style={{ padding: '13px 34px', border: '1px solid rgba(103,232,249,.3)', color: 'var(--kyber-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', textDecoration: 'none', borderRadius: 4, transition: 'all .3s' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--kyber)'; e.currentTarget.style.color = 'var(--kyber)' }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(103,232,249,.3)'; e.currentTarget.style.color = 'var(--kyber-dim)' }}>
                WALK THE GATE AGAIN
              </Link>
            </div>
          </div>
        )}

        {/* PRESS THROUGH — the impatient skip the hold, never the moment */}
        {phase < 4 && (
          <button
            data-cursor="PRESS"
            onClick={() => setPhase((p) => Math.min(p + 1, 4))}
            style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'none', border: 'none', color: 'var(--ghost)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.34em', cursor: 'none', opacity: 0.75, padding: 12, transition: 'color .3s' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--bone)' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--ghost)' }}>
            PRESS THROUGH ▸
          </button>
        )}
      </div>
    </div>
  )
}

function RITE_EVERY(done: string[]) {
  return done.includes('signal') && done.includes('focus') && done.includes('choice')
}
