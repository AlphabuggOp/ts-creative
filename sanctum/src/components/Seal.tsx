import { useEffect, useRef, useState } from 'react'
import { chime, riser } from './audio'

const STATUS = [
  'CALIBRATING KYBER LATTICE',
  'MASKING FORCE SIGNATURE',
  'SPOOFING IMPERIAL BEACONS',
  'ALIGNING HYPERDRIVE INVERTERS',
  'DECRYPTING SYNDICATE CIPHER',
  'CHARGING PORTAL RING',
]

/**
 * THE SEAL — the loading veil. Real-load-synced (document.fonts.ready) with a
 * min-duration floor so the theater always plays. Lifts via clip-path iris —
 * the first portal you ever pass through.
 */
export default function Seal({ onLift, quick = false }: { onLift: () => void; quick?: boolean }) {
  const [pct, setPct] = useState(0)
  const [statusIdx, setStatusIdx] = useState(0)
  const [opening, setOpening] = useState(false)
  const [sweep, setSweep] = useState(false) // L11: surveillance theater line
  const veil = useRef<HTMLDivElement>(null)
  const liftRef = useRef<() => void>(() => {})

  useEffect(() => {
    /* SCROLL LOCK — capture-phase event guards instead of overflow:hidden.
       overflow:hidden on <html> poisons Lenis (it reads a non-scrollable page
       and never re-engages). Guards eat wheel/touch/scroll-keys BEFORE Lenis
       ever sees them, vanish at lift, and leave the page scrollable all along. */
    const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'End', 'Home',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
    const block = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation() }
    const blockKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key) && !lifted) { e.preventDefault(); e.stopImmediatePropagation() }
    }
    const blockMove = (e: Event) => { if (!lifted) block(e) }
    const unlock = () => {
      window.removeEventListener('wheel', blockMove, true)
      window.removeEventListener('touchmove', blockMove, true)
      window.removeEventListener('keydown', blockKey, true)
    }
    window.addEventListener('wheel', blockMove, { capture: true, passive: false })
    window.addEventListener('touchmove', blockMove, { capture: true, passive: false })
    window.addEventListener('keydown', blockKey, { capture: true })

    const LIFT_AT = quick ? 900 : 2050 // wall-clock lift point — NOT rAF-driven
    const t0 = performance.now()
    let fontsReady = false
    let lifted = false
    let finished = false
    document.fonts.ready.then(() => { fontsReady = true })

    // L11 — rare theater: a surveillance sweep flashes by ~1 in 5 loads
    const sweepAt = Math.random() < 0.22 ? 52 + Math.random() * 30 : Infinity
    // L12 — Konami: ↑↑↓↓ during the seal lifts it instantly
    const seq: string[] = []
    const onKey = (e: KeyboardEvent) => {
      seq.push(e.key)
      seq.splice(0, seq.length - 4)
      if (seq.join(',') === 'ArrowUp,ArrowUp,ArrowDown,ArrowDown') liftRef.current()
    }
    window.addEventListener('keydown', onKey)

    const finish = () => {
      if (finished) return
      finished = true
      unlock()
      onLift()
    }
    const doLift = () => {
      if (lifted) return
      lifted = true
      cancelAnimationFrame(raf)
      setPct(100)
      setStatusIdx(STATUS.length - 1)
      chime(660, 1.6, 0.08)
      riser(0.9, 0.05) // veil-lift swell
      setOpening(true)
      const node = veil.current
      if (node && node.animate) {
        const anim = node.animate(
          [
            { clipPath: 'circle(141% at 50% 50%)', opacity: 1 },
            { clipPath: 'circle(0% at 50% 50%)', opacity: 1 },
          ],
          { duration: quick ? 520 : 820, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' },
        )
        anim.onfinish = finish
        // belt & braces — if the compositor silently eats onfinish, unlock anyway
        setTimeout(finish, (quick ? 520 : 820) + 450)
      } else finish()
    }
    liftRef.current = doLift
    // FAILSAFE — fires even if rAF is throttled to death (background tab, power saver)
    const failSafe = setTimeout(doLift, LIFT_AT + 1100)

    let raf = 0
    let lastV = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = performance.now() - t0
      const raw = Math.min(el / LIFT_AT, 1)
      let v = Math.floor((1 - Math.pow(1 - raw, 1.55)) * 100)
      if (!fontsReady && raw >= 1) v = 93 // honest hold if fonts genuinely still load
      if (v !== lastV) {
        lastV = v
        setPct(v)
        setSweep(v > sweepAt && v < sweepAt + 14)
        setStatusIdx(Math.min(Math.floor((v / 100) * STATUS.length), STATUS.length - 1))
      }
      if (el > LIFT_AT && fontsReady) doLift()
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(failSafe)
      unlock()
      window.removeEventListener('keydown', onKey)
    }
  }, [onLift, quick])

  return (
    <div ref={veil} role="status" aria-label="Opening the veil"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#020306', display: 'grid', placeItems: 'center', clipPath: 'circle(141% at 50% 50%)' }}>
      <div style={{ textAlign: 'center', position: 'relative', padding: 48 }}>
        {/* self-drawing sigil */}
        <div className={opening ? '' : 'seal-breathe'} style={{ display: 'grid', placeItems: 'center', marginBottom: 26 }}>
          <svg width="72" height="72" viewBox="0 0 100 100" fill="none" aria-hidden>
            <circle className="seal-draw" cx="50" cy="50" r="46" stroke="var(--kyber)" strokeWidth="1.2" pathLength={1} strokeDasharray={1} />
            <path className="seal-draw" style={{ animationDelay: '.35s' }} d="M50 14 L56 44 L86 50 L56 56 L50 86 L44 56 L14 50 L44 44 Z" stroke="var(--kyber)" strokeWidth="1.2" fill="none" pathLength={1} strokeDasharray={1} />
            <circle cx="50" cy="50" r="4.4" fill="var(--ember)" />
          </svg>
        </div>
        {/* the counter */}
        <div className="t-mono" style={{ fontSize: 'clamp(44px, 6.4vw, 78px)', fontWeight: 500, letterSpacing: '.06em', color: 'var(--bone)', fontVariantNumeric: 'tabular-nums' }}>
          {String(pct).padStart(3, '0')}
          <span style={{ fontSize: '.34em', color: 'var(--kyber-dim)', marginLeft: 8 }}>%</span>
        </div>
        {/* thin progress track */}
        <div style={{ width: 190, height: 1, background: 'rgba(103,232,249,.16)', margin: '18px auto 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `scaleX(${pct / 100})`, transformOrigin: 'left', background: 'linear-gradient(90deg,#2e8fa3,#9ff2ff)', boxShadow: '0 0 12px rgba(103,232,249,.6)', transition: 'transform .12s linear' }} />
        </div>
        {/* rotating status microcopy */}
        <p className="t-mono" key={statusIdx} style={{ marginTop: 16, fontSize: 10, letterSpacing: '.3em', color: 'var(--ghost)', animation: 'sealStatus .42s ease-out' }}>
          {pct >= 100 ? 'CHANNEL OPEN.' : sweep ? '» SURVEILLANCE SWEEP — RE-ROUTING SIGNAL …' : `» ${STATUS[statusIdx]} …`}
        </p>
        <p className="t-mono" style={{ marginTop: 30, fontSize: 9, letterSpacing: '.42em', color: 'rgba(154,163,178,.5)' }}>
          S A N C T U M
        </p>
      </div>
    </div>
  )
}
