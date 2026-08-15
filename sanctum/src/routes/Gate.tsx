import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import SplitType from 'split-type'
import PortalScene from '../three/PortalScene'
import Scramble from '../components/Scramble'
import GlyphRain from '../components/GlyphRain'
import Seal from '../components/Seal'
import WhisperMotes from '../components/WhisperMotes'
import { Starfield } from '../components/fx'
import { ShinyText } from '../components/textfx'
import { armOnFirstGesture, chime, playVoice, thud, swell, riser, impact, staticBurst } from '../components/audio'
import { CSSPortal, GLBoundary, GLDebug, glOk, glRecheck } from '../components/gl'
import { useSanctum } from '../store'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const BOOT_LINES = [
  '» ESTABLISHING SECURE UPLINK …',
  '» MASKING FORCE SIGNATURE …',
  '» DECRYPTING SYNDICATE CIPHER …',
  '» CHANNEL OPEN.',
]
const LINES = [
  "YOU FEEL IT, DON'T YOU",
  'A SIGNAL BENEATH THE STATIC',
  'WE ARE THE HCET SYNDICATE',
]
const KICKERS = ['SIGNAL ACQUISITION', 'PHASE-LOCK CONFIRMED', 'IDENTITY DISCLOSED']

function Sigil() {
  return (
    <svg width="96" height="96" viewBox="0 0 100 100" fill="none" aria-hidden>
      <circle cx="50" cy="50" r="46" stroke="var(--kyber)" strokeWidth="1.4"
        pathLength={1} strokeDasharray={1} strokeDashoffset={0} strokeLinecap="round" />
      <path d="M50 14 L56 44 L86 50 L56 56 L50 86 L44 56 L14 50 L44 44 Z"
        stroke="var(--kyber)" strokeWidth="1.4" fill="rgba(103,232,249,.07)"
        pathLength={1} strokeDasharray={1} strokeDashoffset={0} />
      <circle cx="50" cy="50" r="5" fill="var(--ember)" />
    </svg>
  )
}

export default function Gate() {
  const wrap = useRef<HTMLDivElement>(null)
  const prog = useRef({ p: 0 })
  const arrivedRef = useRef(false)
  const [arrived, setArrived] = useState(false)
  const [sealed, setSealed] = useState(true)
  const [awake, setAwake] = useState(false) // sound armed by first real touch
  const setSeen = useSanctum((s) => s.setSeenGate)
  const seen = useSanctum((s) => s.seenGate)
  const visitor = useSanctum((s) => s.visitor)
  const callsign = useSanctum((s) => s.callsign)
  /* GL can answer "no" once and "yes" moments later (cold GPU process) —
     keep knocking until the real portal can mount */
  const [glAlive, setGlAlive] = useState(() => glOk())
  useEffect(() => {
    if (glAlive) return
    const ids = [600, 1600, 3200, 6000].map((t) =>
      setTimeout(() => { if (glRecheck()) setGlAlive(true) }, t),
    )
    return () => ids.forEach(clearTimeout)
  }, [glAlive])

  useEffect(() => {
    armOnFirstGesture(() => undefined) // unlock WebAudio on first real activation
    const wake = () => setAwake(true)
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    window.addEventListener('touchstart', wake, { once: true })
    /* SCROLL LAW — mounting the Gate always starts the journey at the top,
       wherever the previous layer/page left the scrollbar. */
    window.scrollTo(0, 0)
  }, [])

  useGSAP(
    () => {
      const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.05 })
      const raf = (t: number) => lenis.raf(t * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)
      lenis.on('scroll', ScrollTrigger.update)

      const railFill = wrap.current!.querySelector('.gt-rail-fill')
      const railPct = wrap.current!.querySelector('.gt-rail-pct')
      const shock = wrap.current!.querySelector('.gt-shock') as HTMLElement | null
      let prevP = 0
      const crossed = (th: number, p: number) => (prevP - th) * (p - th) < 0
      /* hoisted — onUpdate can fire before the split-work below (refresh) */
      type LineParts = { root: HTMLElement; inner: HTMLElement[]; kicker: HTMLElement; rule: HTMLElement }
      let lineParts: LineParts[] = []
      let wordChars: HTMLElement[] = []
      // hold windows: flicker ON at settle, OFF at exit (stateless — scrub-proof)
      const HOLDS: [number, number][] = [[0.1, 0.148], [0.238, 0.3], [0.391, 0.455]]

      /** G17 — ember sparks bursting from the door seam */
      function sparkBurst() {
        const layer = wrap.current?.querySelector('.gt-sparks')
        if (!layer) return
        for (let i = 0; i < 9; i++) {
          const s = document.createElement('span')
          s.className = 'gt-spark'
          s.style.left = '50%'
          s.style.top = `${15 + Math.random() * 70}%`
          layer.appendChild(s)
          const side = Math.random() > 0.5 ? 1 : -1
          s.animate(
            [{ transform: 'translate(0,0) scale(1)', opacity: 1 },
             { transform: `translate(${side * (10 + Math.random() * 42)}vw, ${Math.random() * 22 - 11}vh) scale(.2)`, opacity: 0 }],
            { duration: 620 + Math.random() * 420, easing: 'cubic-bezier(.16,1,.3,1)' },
          ).onfinish = () => s.remove()
        }
      }

      ScrollTrigger.create({
        trigger: wrap.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress
          // sound design hits on beat crossings (fire scrolling EITHER way)
          for (const th of [0.045, 0.183, 0.336]) if (crossed(th, p)) { thud(0.18); staticBurst(0.2, 0.05) }
          if (crossed(0.5, p)) { swell(1.8, 0.13); sparkBurst() }
          if (crossed(0.66, p)) riser(2.6, 0.1)
          if (crossed(0.928, p)) impact(0.26)
          // G13 — transmissions flicker with interference while they hold
          lineParts.forEach((lp, i) => lp.root.classList.toggle('is-hold', p >= HOLDS[i][0] && p < HOLDS[i][1]))
          // G20 — a current sliver sweeps the SANCTUM wordmark as it lands
          // (forward crossings only — scrubbing back doesn't re-fire the flash)
          if (crossed(0.685, p) && p > prevP) {
            staticBurst(0.3, 0.05)
            const swp = wrap.current?.querySelector('.gt-sweep') as HTMLElement | null
            if (swp) {
              swp.style.visibility = 'visible'
              swp.animate(
                [{ left: '-14%', opacity: 0 },
                 { left: '8%', opacity: 0.55, offset: 0.25 },
                 { left: '72%', opacity: 0.55, offset: 0.75 },
                 { left: '108%', opacity: 0 }],
                { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)' },
              ).onfinish = () => { swp.style.visibility = 'hidden' } // kill the compositor tile
            }
            const w = wrap.current?.querySelector('.gt-word') as HTMLElement | null
            if (w) gsap.fromTo(w, { filter: 'brightness(1)' }, {
              filter: 'brightness(1.55)', duration: 0.16, yoyo: true, repeat: 1,
              ease: 'power1.inOut', overwrite: 'auto',
              onComplete: () => gsap.set(w, { clearProps: 'filter' }),
            })
          }
          // assembly-complete shockwave
          if (crossed(0.7, p) && shock && p > prevP) {
            shock.animate(
              [{ transform: 'translate(-50%,-50%) scale(.18)', opacity: 0.85 },
               { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }],
              { duration: 950, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' })
          }
          prevP = p
          gsap.to(prog.current, { p: self.progress, duration: 0.35, ease: 'power2.out', overwrite: true })
          if (railFill) (railFill as HTMLElement).style.transform = `scaleY(${self.progress})`
          if (railPct) (railPct as HTMLElement).textContent = String(Math.round(self.progress * 100)).padStart(2, '0')
          if (self.progress > 0.955 && !arrivedRef.current) {
            arrivedRef.current = true
            setArrived(true)
            setSeen(true)
            chime(880, 2.2, 0.14)
            chime(1320, 2.8, 0.07)
            playVoice('/audio/arrive.mp3', 0.9, 180, 'arrive')
          }
        },
      })

      /* ── split everything once → char spans for entrances ── */
      lineParts = LINES.map((_, i) => {
        const root = wrap.current!.querySelector(`.gt-line-${i}`) as HTMLElement
        new SplitType(root, { types: 'chars' })
        const kicker = root.querySelector('.gt-line-kicker') as HTMLElement
        const rule = root.querySelector('.gt-line-rule') as HTMLElement
        // SplitType force-sets position:relative on split elements — re-assert absolutes
        kicker.style.position = 'absolute'
        rule.style.position = 'absolute'
        return {
          root,
          inner: Array.from(root.querySelectorAll('.gt-line-inner .char')) as HTMLElement[],
          kicker,
          rule,
        }
      })
      wordChars = new SplitType('.gt-word', { types: 'chars' }).chars as HTMLElement[]
      const whisperChars = [0, 1].map((i) => {
        const el = wrap.current!.querySelector(`.gt-whisper-${i + 1} .gt-wh-in`) as HTMLElement
        return new SplitType(el, { types: 'chars' }).chars as HTMLElement[]
      })

      /* ── master scroll-scrub timeline (duration pinned to 1 → positions = fractions) ──
         NO-OVERLAP LAW: every text block fully exits before the next enters. */
      const tl = gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: 'top top', end: 'bottom bottom', scrub: 0.5 },
        defaults: { ease: 'none' },
      })

      // HUD + hint exit
      if (!seen) tl.to('.gt-hud, .gt-corner', { autoAlpha: 0, duration: 0.03 }, 0.04)
      tl.to('.gt-attune', { autoAlpha: 0, y: -16, duration: 0.04 }, 0.045)

      /* ── the three transmissions — BEAT LOCK v2.2 ──
         every line: fast in → REAL hold (≥4.8% of scroll ≈ 270px) → crisp shatter → silence.
         stagger tails are BUDGETED INSIDE each window (tail = chars × stagger). */
      const WIN = [
        { in: 0.045, out: 0.148 }, // settle .100 · hold 4.8% · gone .183
        { in: 0.183, out: 0.300 }, // settle .238 · hold 6.2% · gone .335
        { in: 0.336, out: 0.455 }, // settle .391 · hold 6.4% · gone .490
      ]
      lineParts.forEach(({ inner, kicker, rule }, i) => {
        const { in: at, out } = WIN[i]
        // entrance — opacity lands FIRST (crisp fast), form follows (short & juicy)
        tl.fromTo(inner, { opacity: 0 }, { opacity: 1, duration: 0.016, stagger: 0.0012, ease: 'power1.out' }, at)
        tl.fromTo(inner,
          { yPercent: 130, rotateX: -85, transformPerspective: 800, transformOrigin: '50% 100% -60', filter: 'blur(4px)' },
          { yPercent: 0, rotateX: 0, filter: 'blur(0px)', duration: 0.030, stagger: 0.0012, ease: 'power3.out' }, at)
        // kicker types in, rule draws itself
        tl.fromTo(kicker, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.028, ease: 'power2.out' }, at + 0.004)
        tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.035, ease: 'power2.out' }, at + 0.02)
        // shatter exit — chars scatter upward with spin + smear, GONE before the next beat
        tl.to(inner, {
          yPercent: () => gsap.utils.random(-140, -60),
          x: () => gsap.utils.random(-85, 85),
          rotation: () => gsap.utils.random(-14, 14),
          opacity: 0, filter: 'blur(5px)',
          duration: 0.022, ease: 'power2.in',
          stagger: { each: 0.0006, from: 'random' },
        }, out)
        tl.to(rule, { autoAlpha: 0, duration: 0.02 }, out)
        tl.to(kicker, { autoAlpha: 0, y: -12, duration: 0.02 }, out)
      })

      /* ── THE DOORS — void splits open, stars revealed ── */
      tl.to('.gt-stage0', { autoAlpha: 1, duration: 0.1 }, 0.50)
      tl.to(['.gt-door-glow-l', '.gt-door-glow-r'], { autoAlpha: 1, duration: 0.035, ease: 'power1.in' }, 0.50)
      tl.to('.gt-rain', { autoAlpha: 0, duration: 0.06 }, 0.505)
      tl.to('.gt-door-l', { xPercent: -102, duration: 0.11, ease: 'power2.inOut' }, 0.50)
      tl.to('.gt-door-r', { xPercent: 102, duration: 0.11, ease: 'power2.inOut' }, 0.50)
      tl.to('.gt-seam', { autoAlpha: 0, duration: 0.05 }, 0.51)

      // portal assembles 0.53–0.70 inside the 3D scene (driven by prog.p)

      /* ── wordmark + sigil beat — settle .746 · hold · out .775 ── */
      tl.fromTo(wordChars, { opacity: 0 }, { opacity: 1, duration: 0.018, stagger: 0.0035, ease: 'power1.out' }, 0.685)
      tl.fromTo(wordChars, { yPercent: 130, filter: 'blur(6px)' },
        { yPercent: 0, filter: 'blur(0px)', duration: 0.048, stagger: 0.0035, ease: 'expo.out' }, 0.685)
      tl.fromTo('.gt-sigwrap, .gt-scrolldown', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.035 }, 0.715)
      tl.to(['.gt-word', '.gt-sigwrap', '.gt-scrolldown'], { autoAlpha: 0, scale: 1.1, filter: 'blur(8px)', duration: 0.034, ease: 'power2.in' }, 0.775)

      /* ── flight whispers — passing thoughts during hyperdrive ── */
      tl.fromTo(whisperChars[0], { opacity: 0 }, { opacity: 1, duration: 0.014, stagger: 0.0014, ease: 'power1.out' }, 0.795)
      tl.fromTo(whisperChars[0], { yPercent: 120, filter: 'blur(4px)' },
        { yPercent: 0, filter: 'blur(0px)', duration: 0.030, stagger: 0.0014, ease: 'power3.out' }, 0.795)
      tl.to(whisperChars[0], {
        yPercent: () => gsap.utils.random(-140, -80), x: () => gsap.utils.random(-90, 90),
        opacity: 0, filter: 'blur(5px)', duration: 0.024, ease: 'power2.in', stagger: { each: 0.0008, from: 'random' },
      }, 0.842)
      tl.fromTo(whisperChars[1], { opacity: 0 }, { opacity: 1, duration: 0.014, stagger: 0.0013, ease: 'power1.out' }, 0.868)
      tl.fromTo(whisperChars[1], { yPercent: 120, filter: 'blur(4px)' },
        { yPercent: 0, filter: 'blur(0px)', duration: 0.030, stagger: 0.0013, ease: 'power3.out' }, 0.868)
      tl.to(whisperChars[1], {
        yPercent: () => gsap.utils.random(-140, -80), x: () => gsap.utils.random(-90, 90),
        opacity: 0, filter: 'blur(5px)', duration: 0.022, ease: 'power2.in', stagger: { each: 0.0008, from: 'random' },
      }, 0.914)

      /* ── breach ── */
      tl.fromTo('.gt-flash', { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.038 }, 0.928)
      tl.to('.gt-flash', { backgroundColor: 'rgba(180,245,255,.95)', duration: 0.03 }, 0.952)
      tl.to('.gt-stage0', { autoAlpha: 0, duration: 0.05 }, 0.945)
      tl.fromTo('.gt-arrive', { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.024 }, 0.962)
      tl.to('.gt-flash', { autoAlpha: 0, duration: 0.02 }, 0.978)
            tl.set({}, {}, 1) // pin total duration to exactly 1

      return () => lenis.destroy()
    },
    { scope: wrap },
  )

  return (
    <div ref={wrap} style={{ position: 'relative', height: '620vh' }}>
      {sealed && <Seal quick={seen} onLift={() => {
        setSealed(false)
        // boot VO at the moment of the iris — once per session, queues + retries on real touches
        playVoice('/audio/boot-intro.mp3', 0.95, 90, 'boot')
        requestAnimationFrame(() => ScrollTrigger.refresh())
      }} />}
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: '#000' }}>
        {/* 3D stage — starts hidden behind the void, revealed by the doors.
            Insurance stack: Starfield (2D) → CSSPortal (DOM) → WebGL canvas on top.
            If GL fails anywhere, the layers beneath carry the show. */}
        <div className="gt-stage0" style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0, visibility: 'hidden', background: '#04060c' }}>
          <Starfield density={300} />
          <CSSPortal prog={prog.current} />
          {glAlive && (
            <GLBoundary>
              <PortalScene prog={prog.current} />
            </GLBoundary>
          )}
        </div>
        <GLDebug prog={prog.current} />
        {!glAlive && (
          <p className="t-mono" style={{ position: 'fixed', left: 18, bottom: 14, zIndex: 60, fontSize: 9, letterSpacing: '.22em', color: 'var(--ghost)', opacity: 0.8, pointerEvents: 'none' }}>
            » TURBINE MODE — ENABLE GRAPHICS ACCELERATION FOR THE TRUE PORTAL
          </p>
        )}
        {/* G17 spark layer (door seam bursts) */}
        <div className="gt-sparks" style={{ position: 'fixed', inset: 0, zIndex: 41, pointerEvents: 'none' }} />

        {/* scroll rail — minimalist kyber thread */}
        <div className="gt-rail" style={{ position: 'fixed', right: 26, top: '50%', transform: 'translateY(-50%)', zIndex: 40, width: 2, height: '34vh', background: 'rgba(103,232,249,.14)', borderRadius: 2 }}>
          <div className="gt-rail-fill" style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg,#9ff2ff,#2e8fa3)', borderRadius: 2, transformOrigin: 'top', transform: 'scaleY(0)', boxShadow: '0 0 14px rgba(103,232,249,.65), 0 0 34px rgba(103,232,249,.25)' }} />
          <span className="gt-rail-pct t-mono" style={{ position: 'absolute', top: 'calc(100% + 12px)', right: -6, fontSize: 9, letterSpacing: '.2em', color: 'var(--kyber-dim)' }}>00</span>
        </div>

        {/* HUD corner brackets (boot framing, fade with first scroll) */}
        {['tl', 'tr', 'bl', 'br'].map((c) => <div key={c} className={`gt-corner ${c}`} />)}

        {/* HUD console */}
        <div className="gt-hud t-mono" style={{ position: 'absolute', left: 22, bottom: 20, zIndex: 42, fontSize: 11, color: 'var(--ghost)', lineHeight: 1.9 }}>
          {BOOT_LINES.map((l, i) => (
            <Scramble key={l} text={l.replace(' …', '') + (i < 3 ? ' … OK' : ' …')} delay={seen ? 99 : 0.25 + i * 0.55} charMs={16} scrambleMs={280} style={{ display: 'block' }} start={!sealed && !seen} />
          ))}
          {!seen && <span aria-hidden style={{ display: 'inline-block', animation: 'caretBlink 1s steps(1) infinite', animationDelay: '2.6s', opacity: 0, color: 'var(--kyber)', fontSize: 11 }}>█</span>}
        </div>

        {/* attune hint (void stage) — interactive zone so the cursor reads it */}
        <div className="gt-attune" style={{ position: 'absolute', inset: 0, zIndex: 41, display: 'grid', placeItems: 'center', textAlign: 'center' }} data-cursor="SCROLL">
          <div style={{ position: 'relative', padding: '44px 60px' }}>
            <div className="gt-attune-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(232,180,76,.28)' }} />
            <p className="t-mono" style={{ fontSize: 12, letterSpacing: '.4em', color: 'var(--ember)' }}>
              <Scramble text={visitor ? `WELCOME BACK, ${callsign ?? visitor} — SCROLL` : 'ATTUNE — SCROLL'} start={!sealed} delay={seen ? 0.5 : 3.1} charMs={24} scrambleMs={300} />
            </p>
            <div className="gt-chevrons t-mono" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.1, color: 'var(--ember)', opacity: .85 }}>▽<br />▽</div>
            {!awake && (
              <p className="t-mono" style={{ marginTop: 18, fontSize: 9, letterSpacing: '.32em', color: 'var(--ghost)', opacity: .8, animation: 'caretBlink 1.6s steps(1) infinite' }}>
                » CLICK ANYWHERE — WAKE THE SIGNAL «
              </p>
            )}
          </div>
        </div>

        {/* the three transmissions — windowed so they never share the screen */}
        {LINES.map((t, i) => (
          <div key={t} className={`gt-line gt-line-${i}`} style={{ position: 'absolute', inset: 0, zIndex: 43, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '0 6vw' }}>
            <p className={`t-mono gt-line-kicker ${i === 2 ? 't-ember' : ''}`} style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -74, fontSize: 11, letterSpacing: '.34em', color: i === 2 ? 'var(--ember)' : 'var(--kyber-dim)', opacity: 0, whiteSpace: 'nowrap' }}>
              ◈ TRANSMISSION 0{i + 1} / 03 — {KICKERS[i]}
            </p>
            <span className="t-display gt-line-inner" style={{ display: 'inline-block', fontSize: 'clamp(18px, 4.4vw, 60px)', fontWeight: 700, letterSpacing: '.1em', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              {t}
            </span>
            <span className="gt-line-rule" style={{ position: 'absolute', left: 'calc(50% - 75px)', top: 'calc(50% + 58px)', width: 150, height: 1, transform: 'scaleX(0)', transformOrigin: 'center', background: 'linear-gradient(90deg, transparent, rgba(103,232,249,.85), transparent)', boxShadow: '0 0 12px rgba(103,232,249,.5)', display: 'block' }} />
          </div>
        ))}

        {/* glyph rain — alive void texture over the sealed doors */}
        <GlyphRain className="gt-rain" style={{ zIndex: 39 }} />

        {/* assembly-complete shockwave (WAAPI burst) */}
        <div className="gt-shock" style={{ position: 'absolute', left: '50%', top: '50%', width: '46vmin', height: '46vmin', borderRadius: '50%', border: '1px solid rgba(159,242,255,.9)', boxShadow: '0 0 40px rgba(103,232,249,.5), inset 0 0 40px rgba(103,232,249,.3)', opacity: 0, transform: 'translate(-50%,-50%) scale(.18)', zIndex: 22, pointerEvents: 'none' }} />

        {/* THE DOORS + seam + edge glow */}
        <div className="gt-door-l" style={{ position: 'absolute', top: 0, left: 0, width: '50.2%', height: '100%', zIndex: 38, background: 'linear-gradient(90deg,#04060a 0%,#070b13 55%,#0a101d 100%)', boxShadow: 'inset -40px 0 80px rgba(0,0,0,.8)' }}>
          <div className="gt-door-glow-l" style={{ position: 'absolute', top: 0, right: 0, width: 2, height: '100%', opacity: 0, background: 'rgba(159,242,255,.9)', boxShadow: '0 0 26px rgba(103,232,249,.9), 0 0 80px rgba(103,232,249,.4)' }} />
        </div>
        <div className="gt-door-r" style={{ position: 'absolute', top: 0, right: 0, width: '50.2%', height: '100%', zIndex: 38, background: 'linear-gradient(270deg,#04060a 0%,#070b13 55%,#0a101d 100%)', boxShadow: 'inset 40px 0 80px rgba(0,0,0,.8)' }}>
          <div className="gt-door-glow-r" style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', opacity: 0, background: 'rgba(159,242,255,.9)', boxShadow: '0 0 26px rgba(103,232,249,.9), 0 0 80px rgba(103,232,249,.4)' }} />
        </div>
        <div className="gt-seam" style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', zIndex: 39, background: 'rgba(103,232,249,.55)', boxShadow: '0 0 18px rgba(103,232,249,.5)', animation: 'seamPulse 2.6s ease-in-out infinite' }} />
        <style>{`@keyframes seamPulse{0%,100%{opacity:.35}50%{opacity:.9}}`}</style>

        {/* wordmark + sigil (post-assembly beat) */}
        <div className="gt-wordwrap" style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'relative' }}>
            {/* G20 traveling current band (WAAPI) */}
            <div className="gt-sweep" aria-hidden />
            <div className="gt-sigwrap" style={{ marginBottom: 24, display: 'grid', placeItems: 'center', opacity: 0 }}>
              <div style={{ position: 'relative', width: 96, height: 96, display: 'grid', placeItems: 'center' }} data-hot data-label="SANCTUM">
                <svg className="gt-orbit" style={{ position: 'absolute', inset: -16, width: 128, height: 128 }} viewBox="0 0 128 128" aria-hidden>
                  <circle cx="64" cy="64" r="61" stroke="rgba(103,232,249,.3)" strokeWidth="1" strokeDasharray="2 9" fill="none" />
                </svg>
                <Sigil />
              </div>
            </div>
            <h1 className="t-display gt-word gt-steel" style={{ fontSize: 'clamp(46px, 9.5vw, 118px)', fontWeight: 900, lineHeight: 1, letterSpacing: '.1em', overflow: 'hidden', pointerEvents: 'auto' }}>
              SANCTUM
            </h1>
            <p className="gt-scrolldown t-mono" style={{ marginTop: 16, fontSize: 11, letterSpacing: '.35em', color: 'var(--kyber-dim)', opacity: 0 }}>
              <ShinyText><Scramble text="THE HIDDEN NETWORK OF THE HCET SYNDICATE" start={false} /></ShinyText>
            </p>
          </div>
        </div>

        {/* flight whispers */}
        <div className="gt-whisper-1 t-display" style={{ position: 'absolute', inset: 0, zIndex: 21, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <span className="gt-wh-in" style={{ display: 'inline-block', fontSize: 'clamp(20px, 3.6vw, 40px)', fontWeight: 500, letterSpacing: '.3em', color: '#eefbff', textShadow: '0 0 20px rgba(103,232,249,.55), 0 0 70px rgba(103,232,249,.22)' }}>HOLD YOUR BREATH</span>
        </div>
        <div className="gt-whisper-2 t-display" style={{ position: 'absolute', inset: 0, zIndex: 21, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <span className="gt-wh-in" style={{ display: 'inline-block', fontSize: 'clamp(20px, 3.6vw, 40px)', fontWeight: 500, letterSpacing: '.3em', color: '#eefbff', textShadow: '0 0 20px rgba(103,232,249,.55), 0 0 70px rgba(103,232,249,.22)' }}>WE CROSS BETWEEN STARS</span>
        </div>

        {/* flash + arrival */}
        <div className="gt-flash" style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'rgba(103,232,249,.55)', opacity: 0, pointerEvents: 'none' }} />
        <div className="gt-arrive" style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'grid', placeItems: 'center', textAlign: 'center', opacity: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(4,6,12,.25), rgba(4,6,12,.92))' }}>
          <div style={{ pointerEvents: 'auto', padding: 24 }}>
            <p className="t-mono t-kyber" style={{ fontSize: 12, letterSpacing: '.35em' }}>
              <Scramble text="BREACH ACCEPTED" start={arrived} delay={0.1} charMs={26} scrambleMs={300} />
            </p>
            <h2 className="t-display gt-steel" style={{ fontSize: 'clamp(30px, 5.5vw, 64px)', fontWeight: 700, marginTop: 16, display: 'inline-block' }}>
              <Scramble text="SANCTUM REACHED" start={arrived} delay={0.35} charMs={52} scrambleMs={420} />
            </h2>
            <p className="t-dim" style={{ marginTop: 14, maxWidth: 460, marginInline: 'auto', fontWeight: 300 }}>
              The Sanctum hears you, traveler. Beyond this threshold stand the Trials of Awakening.
            </p>
            <Link to="/trials" data-hot data-label="ENTER" data-cursor="ENTER" className="gt-enter"
              style={{ display: 'inline-block', marginTop: 34, padding: '15px 44px', border: '1px solid var(--kyber)', color: 'var(--kyber)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', transition: 'background .3s, color .3s, box-shadow .3s' }}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                gsap.to(e.currentTarget, {
                  x: (e.clientX - (r.left + r.width / 2)) * 0.32,
                  y: (e.clientY - (r.top + r.height / 2)) * 0.32,
                  duration: 0.4, ease: 'power3.out', overwrite: 'auto',
                })
              }}
              onMouseEnter={(e) => { chime(660, 0.9, 0.07); e.currentTarget.style.background = 'var(--kyber)'; e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.boxShadow = '0 0 34px rgba(103,232,249,.45)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--kyber)'; e.currentTarget.style.boxShadow = 'none'
                gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1,.45)', overwrite: 'auto' }) }}>
              ENTER THE SANCTUM →
            </Link>
            <p className="t-mono t-dim" style={{ marginTop: 20, fontSize: 10, letterSpacing: '.2em', opacity: .7 }}>progress saved · the Sanctum remembers</p>
          </div>
        </div>

        <div className="gt-scan" aria-hidden />
        <div className="layer-fixed vignette" style={{ zIndex: 3 }} />

        {/* THE WHISPERS — three voices hidden in the journey (quest engine) */}
        <WhisperMotes />
      </div>
    </div>
  )
}
