import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Scramble from './Scramble'
import { questEvent } from '../game/quests'
import { blip, chime, focusHum, impact, staticBurst } from './audio'

/* ── TRIAL OF FOCUS ───────────────────────────────────────────────
   Hold your light inside the beacon's ring while the void pulls.
   FIVE waves now:
     I    WATCHES — gentle drift, teaches the hold
     II   TUGS — wider orbit, probe-droid flybys
     III  PULLS — random darts + heavy void theatre
     IV   IT WEARS YOUR LIGHT — a DECOY beacon with a wrong heartbeat
          pulses beside the true one; holding it drains you 2×.
          The true light keeps the sigil heart and the 1.6s breath.
     V    THE VOID REACHES — tendrils latch and DRAG your beacon out;
          wiggle-shake your light to snap the grip, then return.
   The ring tightens as your coherence rises — hold better, finer.
   Scored 0–3 from per-wave in-ring fractions; never punishing.    */

const WAVES = [
  { tag: 'THE VOID WATCHES', orbR: 46, w: 0.55, dartEvery: 0, droids: 0, drain: 9 },
  { tag: 'THE VOID TUGS', orbR: 84, w: 0.85, dartEvery: 0, droids: 5.2, drain: 6.5 },
  { tag: 'THE VOID PULLS', orbR: 108, w: 1.02, dartEvery: 3.4, droids: 3.1, drain: 5 },
  { tag: 'IT WEARS YOUR LIGHT', orbR: 96, w: 1.1, dartEvery: 3.8, droids: 3.4, drain: 5, decoy: true },
  { tag: 'THE VOID REACHES', orbR: 100, w: 0.95, dartEvery: 3.2, droids: 3.4, drain: 5, tendrils: true },
]
const N_WAVES = WAVES.length
const WAVE_SECS = 9
const READY_HOLD = 0.8
const SHAKE_NEED = 11      // accumulated angular velocity (radians-ish) to snap a tendril
const TRUE_PULSE = 1.6     // the true beacon's heartbeat (seconds)
const DECOY_PULSE = 1.04   // the lie's heartbeat — arrhythmic, wrong

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerpC = (t: number, a = 1) =>
  `rgba(${Math.round(232 + (103 - 232) * t)},${Math.round(180 + (232 - 180) * t)},${Math.round(76 + (249 - 76) * t)},${a})`

type Phase = 'ready' | 'wave' | 'banner' | 'verdict'
type Props = { onExit: () => void; onComplete: (score: number) => void }

const PHASE_TITLE: Record<Phase, string> = {
  ready: 'HOLD THE BEACON',
  wave: 'HOLD THE BEACON',
  banner: 'THE BREATH BETWEEN',
  verdict: 'THE BEACON HOLDS',
}

export default function TrialFocus({ onExit, onComplete }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const waveBarRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLSpanElement>(null)

  const [phase, setPhase] = useState<Phase>('ready')
  const [wave, setWave] = useState(0)
  const [wavesDone, setWavesDone] = useState(0)
  const [verdict, setVerdict] = useState<{ score: number; coh: number; fracs: number[] } | null>(null)

  const sim = useRef({
    phase: 'ready' as Phase,
    wave: 0,
    waveStart: 0,
    bannerUntil: 0,
    phi: 0,
    bx: 0, by: 0,
    dartX: 0, dartY: 0,
    dartAt: Infinity,
    nextDroidAt: Infinity,
    nextPulseAt: Infinity,
    px: 0, py: 0,           // canvas-local pointer
    pointerSeen: false,
    inRing: false,
    outStreak: 0,
    readyHold: 0,
    cohMeter: 0,            // display meter 0..1 (grows inside, drains outside)
    ringR: 118,
    waveInT: 0,
    waveElT: 0,
    fracs: [] as number[],
    qualities: [] as number[],
    exitAt: N_WAVES,        // waves completed (5 = all)
    /* W4 — the decoy */
    decoy: false,
    dphi: 0,
    ddx: 0, ddy: 0,         // decoy beacon offsets
    decoyHoldT: 0,          // seconds spent holding the lie this wave
    holdingDecoy: false,
    /* W5 — tendrils */
    tendrils: false,
    tethered: false,
    tetherStart: 0,
    tendrilAt: Infinity,
    graceUntil: 0,
    mx: 0, my: 0,           // void mouth position
    shakeAcc: 0,
    lastPA: 0,              // last pointer-move angle
    lastPT: 0,
    breakFlash: 0,          // timestamp of last snap (for the release ripple)
  }).current

  useEffect(() => {
    let alive = true
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => { if (alive) fn() }, ms)
      timers.push(id)
    }
    const goPhase = (p: Phase) => { sim.phase = p; setPhase(p) }

    gsap.fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' })
    gsap.fromTo('.tfc-in > *', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'power2.out', delay: 0.15 })

    /* canvas */
    const canvas = canvasRef.current!
    const c2 = canvas.getContext('2d')!
    let W = 0, H = 0
    let rect = { left: 0, top: 0 }
    const fit = () => {
      const r = canvas.getBoundingClientRect()
      W = r.width; H = r.height
      rect = { left: r.left, top: r.top }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      c2.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    window.addEventListener('resize', fit)

    /* pointer — the player's light (also the wiggle-shake sensor) */
    const trail: { x: number; y: number; t: number }[] = []
    let lastPX = 0, lastPY = 0
    const onPoint = (e: PointerEvent) => {
      sim.px = e.clientX - rect.left
      sim.py = e.clientY - rect.top
      sim.pointerSeen = true
      /* wiggle detection: accumulate angular energy of the stroke's direction */
      const dxp = sim.px - lastPX
      const dyp = sim.py - lastPY
      const sp = Math.hypot(dxp, dyp)
      if (sp > 6) {
        const na = Math.atan2(dyp, dxp)
        let da = na - sim.lastPA
        if (da > Math.PI) da -= Math.PI * 2
        if (da < -Math.PI) da += Math.PI * 2
        sim.shakeAcc += Math.abs(da) * clamp(sp / 40, 0.4, 1.4)
        sim.lastPA = na
        lastPX = sim.px
        lastPY = sim.py
      }
      trail.push({ x: sim.px, y: sim.py, t: performance.now() })
      if (trail.length > 30) trail.shift()
    }
    window.addEventListener('pointermove', onPoint, { passive: true })
    window.addEventListener('pointerdown', onPoint, { passive: true })

    /* distractions */
    const droids: { x: number; y: number; vx: number; bob: number; stung: boolean }[] = []
    const pulses: { side: number; t0: number }[] = []
    /* heartbeat rings — the true beacon breathes on TRUE_PULSE, the decoy on its own wrong clock */
    const pRings: { t0: number; decoy: boolean }[] = []
    let nextTP = performance.now() + TRUE_PULSE * 1000
    let nextDP = performance.now() + 1400

    let hum: { set: (s: number) => void; stop: () => void } | null = null
    let dartTween: gsap.core.Tween | null = null

    function beginWave(i: number) {
      sim.wave = i
      setWave(i)
      sim.phi = Math.random() * Math.PI * 2
      sim.waveInT = 0
      sim.waveElT = 0
      sim.waveStart = performance.now()
      const wv = WAVES[i]
      sim.dartAt = wv.dartEvery ? sim.waveStart + 1600 + Math.random() * 1400 : Infinity
      sim.nextDroidAt = wv.droids ? sim.waveStart + 2000 + Math.random() * 2000 : Infinity
      sim.nextPulseAt = i > 0 ? sim.waveStart + 2500 + Math.random() * 2500 : Infinity
      /* W4 — the lie wakes beside the truth */
      sim.decoy = !!wv.decoy
      sim.dphi = Math.random() * Math.PI * 2
      sim.decoyHoldT = 0
      /* W5 — the void reaches */
      sim.tendrils = !!wv.tendrils
      sim.tethered = false
      sim.shakeAcc = 0
      sim.graceUntil = 0
      sim.tendrilAt = wv.tendrils ? sim.waveStart + 2200 + Math.random() * 1200 : Infinity
      goPhase('wave')
      blip(true)
    }

    function endWave() {
      /* never strand the player mid-tether at the whistle */
      sim.tethered = false
      const frac = sim.waveElT > 0 ? sim.waveInT / sim.waveElT : 0
      const q = clamp((frac - 0.35) / 0.6, 0.08, 1)
      sim.fracs.push(frac)
      sim.qualities.push(q)
      setWavesDone(sim.fracs.length)
      questEvent({ type: 'focus-wave', frac }) // flawless-wave quest listens
      if (sim.decoy && sim.decoyHoldT <= 4.0) questEvent({ type: 'decoy-clear' }) // never PARKED on the lie (brushes forgiven, camping exposed)
      // chime cadence rides the score band
      if (q > 0.75) { chime(523.25, 1, 0.09); later(90, () => chime(659.25, 1.1, 0.08)); later(190, () => chime(783.99, 1.3, 0.07)) }
      else if (q > 0.45) { chime(440, 1, 0.08); later(140, () => chime(554.37, 1.2, 0.07)) }
      else chime(311, 1.4, 0.07)
      dartTween?.kill(); gsap.to(sim, { dartX: 0, dartY: 0, duration: 0.3 })
      if (sim.wave >= N_WAVES - 1) { showVerdict(); return }
      goPhase('banner')
      sim.bannerUntil = performance.now() + 1700
    }

    function showVerdict() {
      goPhase('verdict')
      const total = sim.qualities.reduce((a, b) => a + b, 0)
      const score = Math.round(total * (3 / N_WAVES))
      const coh = Math.round((sim.fracs.reduce((a, b) => a + b, 0) / N_WAVES) * 100)
      setVerdict({ score, coh, fracs: [...sim.fracs] })
      impact(0.14)
      chime(261.63, 2.4, 0.08)
      later(150, () => chime(329.63, 2.4, 0.07))
      later(300, () => chime(score >= 2 ? 523.25 : 392, 2.8, 0.07))
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sim.phase !== 'verdict') onExit()
    }
    window.addEventListener('keydown', onKey)

    /* loop — WAR-STORY LAW: scoring uses WALL-CLOCK time, never rAF-dt.
       On throttled/software-GPU frames the clamped visual dt under-measures
       real seconds and the trial silently rigs itself against the player. */
    let raf = 0
    let lastT = performance.now()
    let lastWall = performance.now()
    let frame = 0

    const loop = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016) // visual smoothing only
      lastT = now
      const wallDt = Math.min(0.5, (now - lastWall) / 1000 || 0.016) // scoring truth
      lastWall = now
      const t = now / 1000
      const cx = W / 2, cy = H / 2
      const scale = clamp(Math.min(W, H) / 560, 0.7, 1.15)
      const wv = WAVES[sim.wave]

      /* ── motion of the beacon ── */
      if (sim.phase === 'wave') {
        const bt = (now - sim.waveStart) / 1000
        sim.bx = (Math.cos(bt * wv.w + sim.phi) * wv.orbR + sim.dartX) * scale
        sim.by = (Math.sin(bt * wv.w * 1.32 + 1.1) * wv.orbR * 0.72 + sim.dartY) * scale
        sim.waveElT = bt

        /* W4 — the decoy wanders beside you, no darts (too calm — another tell) */
        if (sim.decoy) {
          sim.ddx = Math.cos(bt * wv.w * 0.86 + sim.dphi) * wv.orbR * 1.14 * scale
          sim.ddy = Math.sin(bt * wv.w * 1.21 + sim.dphi + 2.2) * wv.orbR * 0.8 * scale
        }

        /* W5 — tendril strikes: latched? pulled. Shaken free? snapped. */
        if (sim.tendrils) {
          if (!sim.tethered && now > sim.tendrilAt && now > sim.graceUntil) {
            sim.tethered = true
            sim.tetherStart = now
            sim.shakeAcc = 0
            const side = (Math.random() * 4) | 0
            sim.mx = side === 0 ? -26 : side === 1 ? W + 26 : W * (0.15 + Math.random() * 0.7)
            sim.my = side === 2 ? -26 : side === 3 ? H + 26 : H * (0.15 + Math.random() * 0.7)
            staticBurst(0.3, 0.06)
            blip(false)
          }
          if (sim.tethered) {
            sim.shakeAcc *= Math.max(0, 1 - wallDt * 1.5)
            if (sim.shakeAcc > SHAKE_NEED) {
              sim.tethered = false
              sim.breakFlash = now
              sim.graceUntil = now + 2400
              sim.tendrilAt = now + 2400 + 1200 + Math.random() * 1600
              chime(659.25, 0.9, 0.09)
              later(90, () => chime(987.77, 1.1, 0.07))
              impact(0.12)
            } else {
              /* the drag — toward the void mouth, accelerating */
              const pull01 = Math.min(Math.pow((now - sim.tetherStart) / 1400, 1.15), 0.8)
              sim.bx = sim.bx + ((sim.mx - cx) - sim.bx) * pull01
              sim.by = sim.by + ((sim.my - cy) - sim.by) * pull01
            }
          }
        }

        /* darts — the void yanks */
        if (now > sim.dartAt) {
          sim.dartAt = now + wv.dartEvery * 1000 * (0.75 + Math.random() * 0.6)
          const ang = Math.random() * Math.PI * 2
          const mag = 55 + Math.random() * 65
          dartTween?.kill()
          dartTween = gsap.to(sim, {
            dartX: Math.cos(ang) * mag, dartY: Math.sin(ang) * mag,
            duration: 0.26, ease: 'power2.out', yoyo: true, repeat: 1,
          })
          staticBurst(0.18, 0.045)
        }
        /* droid flybys */
        if (now > sim.nextDroidAt) {
          sim.nextDroidAt = now + wv.droids * 1000 * (0.7 + Math.random() * 0.7)
          const fromLeft = Math.random() < 0.5
          droids.push({
            x: fromLeft ? -46 : W + 46,
            y: H * (0.12 + Math.random() * 0.76),
            vx: (fromLeft ? 1 : -1) * (200 + Math.random() * 150),
            bob: Math.random() * Math.PI * 2,
            stung: false,
          })
        }
        /* void edge pulses */
        if (now > sim.nextPulseAt) {
          sim.nextPulseAt = now + (2600 + Math.random() * 3000)
          pulses.push({ side: (Math.random() * 4) | 0, t0: now })
        }

        /* wave clock */
        if (bt >= WAVE_SECS) endWave()
      } else {
        /* ready/banner/verdict — the beacon drifts home, breathes */
        sim.bx += (0 - sim.bx) * 0.06
        sim.by += (0 - sim.by) * 0.06
      }
      if (sim.phase === 'banner' && now > sim.bannerUntil) beginWave(sim.wave + 1)

      /* ── in-ring test + coherence ── */
      const breathe = 1 + 0.05 * Math.sin((t * Math.PI * 2) / TRUE_PULSE)
      sim.ringR = (118 - 32 * sim.cohMeter) * breathe * scale
      const dist = Math.hypot(sim.px - (cx + sim.bx), sim.py - (cy + sim.by))
      let inside = sim.pointerSeen && dist < sim.ringR
      /* decoy test — holding the lie reads as "inside" but feeds the void 2× */
      let holdingDecoy = false
      if (sim.decoy && sim.phase === 'wave' && !inside && sim.pointerSeen) {
        const distD = Math.hypot(sim.px - (cx + sim.ddx), sim.py - (cy + sim.ddy))
        if (distD < sim.ringR * 0.92) {
          holdingDecoy = true
          inside = true // the lie FEELS like shelter — that's the trap
          sim.decoyHoldT += wallDt
          sim.cohMeter = clamp(sim.cohMeter - wallDt / (wv.drain / 2), 0, 1)
        }
      }
      sim.holdingDecoy = holdingDecoy
      /* tethered: the beacon is not yours — scoring pauses, the void feasts */
      const drainMult = sim.tethered ? 2 : 1
      sim.inRing = inside && !sim.tethered
      if (sim.inRing) {
        sim.outStreak = 0
        if (sim.phase === 'wave' && !holdingDecoy) { sim.waveInT += wallDt; sim.cohMeter = clamp(sim.cohMeter + wallDt / 7, 0, 1) }
        if (sim.phase === 'ready') {
          sim.readyHold += wallDt
          sim.cohMeter = clamp(sim.cohMeter + wallDt / 7, 0, 1)
          if (sim.readyHold >= READY_HOLD) beginWave(0)
        }
      } else {
        sim.outStreak += wallDt
        if (sim.phase === 'ready') sim.readyHold = Math.max(0, sim.readyHold - wallDt * 2)
        if (sim.phase === 'wave') sim.cohMeter = clamp(sim.cohMeter - (wallDt * drainMult) / wv.drain, 0, 1)
      }

      /* audio */
      if (!hum) hum = focusHum()
      hum?.set(sim.phase === 'verdict' ? 1 : sim.phase === 'ready' ? sim.readyHold / READY_HOLD * 0.6 : sim.inRing ? 0.55 + sim.cohMeter * 0.45 : 0)

      /* heartbeat ring spawns — truth on its breath, the lie on its own clock */
      if (sim.phase === 'wave' || sim.phase === 'banner') {
        if (now > nextTP) { nextTP = now + TRUE_PULSE * 1000; pRings.push({ t0: now, decoy: false }) }
        if (sim.decoy && now > nextDP) {
          nextDP = now + DECOY_PULSE * 1000 * (0.85 + Math.random() * 0.5)
          pRings.push({ t0: now, decoy: true })
          if (Math.random() < 0.18) pRings.push({ t0: now + 130, decoy: true }) // the lie stutters
        }
      }

      /* spawn of nothing else — draw */
      c2.clearRect(0, 0, W, H)

      /* field vignette + crosshair */
      const gBg = c2.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.62)
      gBg.addColorStop(0, 'rgba(12,18,32,.5)')
      gBg.addColorStop(1, 'rgba(4,6,12,0)')
      c2.fillStyle = gBg
      c2.fillRect(0, 0, W, H)
      c2.strokeStyle = 'rgba(103,232,249,.06)'
      c2.lineWidth = 1
      c2.beginPath(); c2.moveTo(0, cy); c2.lineTo(W, cy); c2.moveTo(cx, 0); c2.lineTo(cx, H); c2.stroke()

      /* void edge pulses */
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        const age = (now - p.t0) / 1200
        if (age >= 1) { pulses.splice(i, 1); continue }
        const a = Math.sin(age * Math.PI) * 0.2
        let gx = 0, gy = 0, gw = W, gh = H
        if (p.side === 0) { gw = W * 0.4 }
        if (p.side === 1) { gx = W * 0.6 }
        if (p.side === 2) { gh = H * 0.35 }
        if (p.side === 3) { gy = H * 0.65 }
        const dir =
          p.side === 0 ? c2.createLinearGradient(0, 0, W * 0.4, 0)
          : p.side === 1 ? c2.createLinearGradient(W, 0, W * 0.6, 0)
          : p.side === 2 ? c2.createLinearGradient(0, 0, 0, H * 0.35)
          : c2.createLinearGradient(0, H, 0, H * 0.65)
        dir.addColorStop(0, `rgba(232,180,76,${a})`)
        dir.addColorStop(1, 'rgba(232,180,76,0)')
        c2.fillStyle = dir
        c2.fillRect(gx, gy, gw, gh)
      }

      /* the light-trail */
      for (let i = 1; i < trail.length; i++) {
        const a0 = 1 - (now - trail[i - 1].t) / 900
        const a1 = 1 - (now - trail[i].t) / 900
        if (a1 <= 0) continue
        c2.strokeStyle = lerpC(0.8, Math.max(0, a1) * 0.5)
        c2.lineWidth = 1.4 + a1 * 1.6
        c2.beginPath()
        c2.moveTo(trail[i - 1].x, trail[i - 1].y)
        c2.lineTo(trail[i].x, trail[i].y)
        c2.stroke()
        if (a0 <= 0) continue
      }
      if (trail.length && now - trail[trail.length - 1].t < 900) {
        const last = trail[trail.length - 1]
        c2.fillStyle = sim.inRing ? 'rgba(200,250,255,.95)' : lerpC(0.5, 0.9)
        c2.beginPath(); c2.arc(last.x, last.y, sim.inRing ? 3.2 : 2.4, 0, Math.PI * 2); c2.fill()
      }

      /* probe-droids — Empire silhouettes sweeping through */
      for (let i = droids.length - 1; i >= 0; i--) {
        const d = droids[i]
        d.x += d.vx * dt
        const dy = d.y + Math.sin(t * 3 + d.bob) * 8
        if ((d.vx > 0 && d.x > W + 60) || (d.vx < 0 && d.x < -60)) { droids.splice(i, 1); continue }
        if (!d.stung && Math.abs(d.x - cx) < 30) { d.stung = true; staticBurst(0.14, 0.035); blip(false) }
        c2.save()
        c2.translate(d.x, dy)
        c2.fillStyle = 'rgba(10,15,26,.92)'
        c2.beginPath(); c2.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2); c2.fill()
        c2.strokeStyle = 'rgba(103,232,249,.16)'
        c2.lineWidth = 1
        c2.beginPath(); c2.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2); c2.stroke()
        c2.beginPath(); c2.moveTo(-7, -10); c2.lineTo(-12, -20); c2.moveTo(7, -10); c2.lineTo(12, -20); c2.stroke()
        c2.fillStyle = 'rgba(224,80,84,.9)'
        c2.beginPath(); c2.arc(d.vx > 0 ? 7 : -7, -2, 2.1, 0, Math.PI * 2); c2.fill()
        c2.restore()
      }

      /* ── THE BEACON ── */
      const bx = cx + sim.bx
      const by = cy + sim.by
      /* jitter when the void has your scent */
      const jit = sim.phase === 'wave' && !inside && sim.outStreak > 0.6 ? 2.2 : 0
      const jx = jit ? (Math.random() * 2 - 1) * jit : 0
      const jy = jit ? (Math.random() * 2 - 1) * jit : 0

      /* bloom */
      const glowA = 0.12 + sim.cohMeter * 0.22
      const gGlow = c2.createRadialGradient(bx, by, 4, bx, by, sim.ringR * 1.6)
      gGlow.addColorStop(0, lerpC(sim.cohMeter, glowA))
      gGlow.addColorStop(1, lerpC(sim.cohMeter, 0))
      c2.fillStyle = gGlow
      c2.beginPath(); c2.arc(bx, by, sim.ringR * 1.6, 0, Math.PI * 2); c2.fill()

      /* the ring (jitters when you're lost) */
      c2.strokeStyle = inside ? lerpC(sim.cohMeter, 0.95) : sim.outStreak > 0.6 ? 'rgba(232,180,76,.6)' : 'rgba(103,232,249,.4)'
      c2.lineWidth = inside ? 2.8 : 2
      c2.beginPath(); c2.arc(bx + jx, by + jy, sim.ringR, 0, Math.PI * 2); c2.stroke()
      /* coherence arc */
      c2.strokeStyle = 'rgba(255,255,255,.07)'
      c2.lineWidth = 2.4
      c2.beginPath(); c2.arc(bx, by, sim.ringR + 13, 0, Math.PI * 2); c2.stroke()
      if (sim.cohMeter > 0.01) {
        c2.strokeStyle = lerpC(sim.cohMeter, 0.9)
        c2.lineWidth = 2.8
        c2.beginPath(); c2.arc(bx, by, sim.ringR + 13, -Math.PI / 2, -Math.PI / 2 + sim.cohMeter * Math.PI * 2); c2.stroke()
      }

      /* core orb — breathes */
      const coreR = 15 * breathe * scale * (1 + sim.cohMeter * 0.25)
      const gCore = c2.createRadialGradient(bx, by, 1, bx, by, coreR)
      gCore.addColorStop(0, 'rgba(235,253,255,.98)')
      gCore.addColorStop(0.5, lerpC(sim.cohMeter, 0.85))
      gCore.addColorStop(1, lerpC(sim.cohMeter, 0.12))
      c2.fillStyle = gCore
      c2.beginPath(); c2.arc(bx, by, coreR, 0, Math.PI * 2); c2.fill()
      /* sigil heart */
      c2.save()
      c2.translate(bx, by)
      c2.strokeStyle = 'rgba(4,10,16,.85)'
      c2.lineWidth = 1.1
      const sr = coreR * 0.5
      c2.beginPath()
      c2.moveTo(0, -sr); c2.lineTo(sr * 0.3, -sr * 0.3); c2.lineTo(sr, 0); c2.lineTo(sr * 0.3, sr * 0.3)
      c2.lineTo(0, sr); c2.lineTo(-sr * 0.3, sr * 0.3); c2.lineTo(-sr, 0); c2.lineTo(-sr * 0.3, -sr * 0.3)
      c2.closePath(); c2.stroke()
      c2.restore()

      /* W4 — THE DECOY BEACON: no sigil heart, wrong pulse, warmer tint */
      if (sim.decoy && sim.phase === 'wave') {
        const dX = cx + sim.ddx
        const dY = cy + sim.ddy
        const dBreath = 1 + 0.08 * Math.sin((t * Math.PI * 2) / DECOY_PULSE + 0.7)
        const gDg = c2.createRadialGradient(dX, dY, 4, dX, dY, sim.ringR * 1.4)
        gDg.addColorStop(0, 'rgba(232,180,76,.16)')
        gDg.addColorStop(1, 'rgba(232,180,76,0)')
        c2.fillStyle = gDg
        c2.beginPath(); c2.arc(dX, dY, sim.ringR * 1.4, 0, Math.PI * 2); c2.fill()
        c2.strokeStyle = sim.holdingDecoy ? 'rgba(232,180,76,.85)' : 'rgba(213,180,120,.42)'
        c2.lineWidth = sim.holdingDecoy ? 2.8 : 2
        c2.beginPath(); c2.arc(dX, dY, sim.ringR * 0.96, 0, Math.PI * 2); c2.stroke()
        const dcR = 12 * dBreath * scale
        const gDc = c2.createRadialGradient(dX, dY, 1, dX, dY, dcR)
        gDc.addColorStop(0, 'rgba(255,240,214,.95)')
        gDc.addColorStop(0.55, 'rgba(232,180,76,.8)')
        gDc.addColorStop(1, 'rgba(232,180,76,.12)')
        c2.fillStyle = gDc
        c2.beginPath(); c2.arc(dX, dY, dcR, 0, Math.PI * 2); c2.fill()
        /* static speckle — the lie can't hold a clean edge */
        c2.fillStyle = 'rgba(232,180,76,.5)'
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2
          const rr = sim.ringR * 0.96 + (Math.random() * 10 - 5)
          c2.fillRect(dX + Math.cos(a) * rr, dY + Math.sin(a) * rr, 1.2, 1.2)
        }
      }

      /* heartbeat rings — expanding pulses from each beacon */
      for (let i = pRings.length - 1; i >= 0; i--) {
        const p = pRings[i]
        const age = (now - p.t0) / 950
        if (age < 0) continue
        if (age >= 1) { pRings.splice(i, 1); continue }
        const ox = p.decoy ? sim.ddx : sim.bx
        const oy = p.decoy ? sim.ddy : sim.by
        c2.strokeStyle = p.decoy ? `rgba(232,180,76,${(1 - age) * 0.34})` : `rgba(103,232,249,${(1 - age) * 0.4})`
        c2.lineWidth = 1.4
        c2.beginPath(); c2.arc(cx + ox, cy + oy, (sim.ringR + 4) * (1 + age * 1.15), 0, Math.PI * 2); c2.stroke()
      }

      /* W5 — the void mouth + tendril strands dragging your light */
      if (sim.tendrils && sim.phase === 'wave') {
        const strain = sim.tethered ? Math.min(1, (now - sim.tetherStart) / 1400) : 0
        if (sim.tethered || now - sim.breakFlash < 900) {
          const mR = 20 + strain * 20
          c2.save()
          c2.translate(sim.mx, sim.my)
          const gM = c2.createRadialGradient(0, 0, 2, 0, 0, mR * 1.6)
          gM.addColorStop(0, 'rgba(2,3,7,.95)')
          gM.addColorStop(1, 'rgba(2,3,7,0)')
          c2.fillStyle = gM
          c2.beginPath(); c2.arc(0, 0, mR * 1.6, 0, Math.PI * 2); c2.fill()
          c2.strokeStyle = `rgba(224,80,84,${0.3 + strain * 0.45})`
          c2.lineWidth = 1.4
          c2.beginPath(); c2.arc(0, 0, mR, 0, Math.PI * 2); c2.stroke()
          for (let i = 0; i < 6; i++) {
            const a0 = t * 1.4 + (i * Math.PI) / 3
            c2.beginPath(); c2.arc(0, 0, mR, a0, a0 + 0.7); c2.stroke()
          }
          c2.restore()
        }
        if (sim.tethered) {
          const gx2 = cx + sim.bx
          const gy2 = cy + sim.by
          const strands = 3
          for (let sIdx = 0; sIdx < strands; sIdx++) {
            const wob = Math.sin(t * 4 + sIdx * 2.1) * 18
            const midX = (sim.mx + gx2) / 2 + wob
            const midY = (sim.my + gy2) / 2 + Math.cos(t * 3.1 + sIdx) * 18
            c2.strokeStyle = `rgba(232,${180 - sIdx * 30},${76 + sIdx * 30},${0.22 + strain * 0.5})`
            c2.lineWidth = 1.2 + sIdx * 0.9 + strain * 3 + sim.shakeAcc * 0.08
            c2.beginPath()
            c2.moveTo(sim.mx, sim.my)
            c2.quadraticCurveTo(midX, midY, gx2, gy2)
            c2.stroke()
          }
          /* strain sparks at the grip */
          c2.fillStyle = 'rgba(232,180,76,.7)'
          for (let i = 0; i < 4; i++) {
            c2.fillRect(gx2 + (Math.random() * 2 - 1) * 16, gy2 + (Math.random() * 2 - 1) * 16, 1.4, 1.4)
          }
        }
        /* snap ripple on break */
        if (!sim.tethered && now - sim.breakFlash < 700) {
          const ra = (now - sim.breakFlash) / 700
          c2.strokeStyle = `rgba(103,232,249,${(1 - ra) * 0.55})`
          c2.lineWidth = 2.6
          c2.beginPath(); c2.arc(cx + sim.bx, cy + sim.by, sim.ringR * (0.5 + ra * 2.2), 0, Math.PI * 2); c2.stroke()
        }
      }

      /* HUD on a slow tick */
      if (++frame % 5 === 0) {
        if (meterRef.current) meterRef.current.style.width = `${(sim.cohMeter * 100) | 0}%`
        if (waveBarRef.current) {
          const frac = sim.phase === 'wave' ? clamp((now - sim.waveStart) / 1000 / WAVE_SECS, 0, 1) : sim.phase === 'banner' ? 1 : 0
          waveBarRef.current.style.width = `${(frac * 100) | 0}%`
        }
        if (hudRef.current) {
          hudRef.current.textContent =
            sim.phase === 'ready' ? (sim.pointerSeen ? '◈ SETTLE INSIDE THE RING' : '— MOVE YOUR LIGHT —')
            : sim.phase === 'wave'
              ? sim.tethered ? '◈ IT HAS YOUR LIGHT — SHAKE IT LOOSE ◈'
              : sim.holdingDecoy ? '· THAT LIGHT IS NOT YOURS ·'
              : inside ? `◈ HOLDING — ${(sim.cohMeter * 100) | 0}%` : '· THE VOID HAS YOUR SCENT ·'
            : sim.phase === 'verdict' ? '◈ RITE COMPLETE ◈' : '· BREATHE ·'
          hudRef.current.style.color = sim.phase === 'wave' && (!inside || sim.tethered || sim.holdingDecoy) ? 'var(--ember)' : 'var(--kyber)'
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    ;(window as unknown as { __tfc?: unknown }).__tfc = {
      phase: () => sim.phase,
      wave: () => sim.wave,
      bx: () => sim.bx,
      by: () => sim.by,
      ring: () => sim.ringR,
      inRing: () => sim.inRing,
      coh: () => sim.cohMeter,
      fracs: () => sim.fracs,
      done: () => sim.fracs.length,
      px: () => sim.px,
      py: () => sim.py,
      inT: () => sim.waveInT,
      elT: () => sim.waveElT,
      seen: () => sim.pointerSeen,
      /* console-state read-outs */
      decoy: () => sim.decoy,
      dx: () => sim.ddx,
      dy: () => sim.ddy,
      decoyHold: () => sim.decoyHoldT,
      tethered: () => sim.tethered,
      shake: () => sim.shakeAcc,
      mx: () => sim.mx,
      my: () => sim.my,
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      timers.forEach((id) => clearTimeout(id))
      window.removeEventListener('resize', fit)
      window.removeEventListener('pointermove', onPoint)
      window.removeEventListener('pointerdown', onPoint)
      window.removeEventListener('keydown', onKey)
      dartTween?.kill()
      gsap.killTweensOf(sim)
      hum?.stop()
      delete (window as unknown as { __tfc?: unknown }).__tfc
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* verdict panel entrance — state-driven per the commit-race law */
  useEffect(() => {
    if (phase !== 'verdict') return
    gsap.fromTo('.tfc-verdict-panel', { autoAlpha: 0, scale: 0.94, y: 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: 'expo.out', delay: 0.2 })
  }, [phase])

  const ROMAN = ['I', 'II', 'III', 'IV', 'V']
  const waveLabel =
    phase === 'ready' ? 'THE VOID WATCHES YOU'
    : phase === 'banner' ? `NEXT — WAVE ${ROMAN[wave + 1] ?? ''} OF V`
    : phase === 'verdict' ? 'RITE COMPLETE'
    : `WAVE ${ROMAN[wave]} OF V — ${WAVES[wave].tag}`

  return (
    <div
      ref={root}
      data-tfc-phase={phase}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(4,6,12,.97)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}
    >
      <div className="tfc-in" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 20px 12px', gap: 8 }}>
        {phase !== 'verdict' && (
          <button
            onClick={onExit}
            data-cursor="RETURN"
            className="tsg-abandon t-mono"
            style={{ position: 'absolute', top: 22, right: 26, zIndex: 7, padding: '9px 16px', background: 'transparent', border: '1px solid rgba(103,232,249,.22)', color: 'var(--ghost)', fontSize: 9, letterSpacing: '.3em', cursor: 'none', borderRadius: 3, transition: 'all .3s' }}
          >
            ABANDON RITE ✕
          </button>
        )}

        <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.4em', color: 'var(--ember)' }}>RITE II — THE TRIAL OF FOCUS</p>
        <h2 className="t-display gt-steel" style={{ fontSize: 'clamp(22px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '.1em', lineHeight: 1.05, minHeight: '1.1em' }}>
          <Scramble key={phase} text={PHASE_TITLE[phase]} charMs={36} scrambleMs={300} />
        </h2>
        <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.3em', color: 'var(--kyber-dim)', minHeight: '1.2em' }}>{waveLabel}</p>

        {/* wave clock — the void's patience */}
        <div style={{ width: 'min(88vw, 720px)', height: 2, background: 'rgba(103,232,249,.09)', borderRadius: 2 }}>
          <div ref={waveBarRef} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg, var(--ember), var(--kyber))', borderRadius: 2, transition: 'width .12s linear' }} />
        </div>

        {/* ── THE FIELD ── */}
        <canvas
          ref={canvasRef}
          data-tfc-field
          data-cursor="HOLD"
          style={{ width: 'min(88vw, 720px)', height: 'min(52vh, 500px)', display: 'block', cursor: 'none', touchAction: 'none' }}
        />

        {/* HUD */}
        <div style={{ width: 'min(88vw, 720px)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ width: 8, height: 8, transform: 'rotate(45deg)', border: '1px solid rgba(103,232,249,.4)', background: wavesDone > i ? 'var(--kyber)' : 'transparent', boxShadow: wavesDone > i ? '0 0 8px var(--kyber)' : 'none', transition: 'all .5s' }} />
            ))}
          </div>
          <div style={{ flex: 1, height: 5, background: 'rgba(103,232,249,.09)', borderRadius: 3, overflow: 'hidden' }}>
            <div ref={meterRef} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg, var(--ember), var(--kyber))', transition: 'width .15s linear' }} />
          </div>
          <span ref={hudRef} className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.22em', minWidth: 210, textAlign: 'right' }}>— MOVE YOUR LIGHT —</span>
        </div>

        <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.85 }}>
          <span style={{ color: 'var(--ember)' }}>KEEP YOUR LIGHT IN THE RING</span> — trust the sigil heart, not the warmth · if the void grabs: <span style={{ color: 'var(--ember)' }}>SHAKE</span> · <span className="tsg-key">ESC</span> abandon
        </p>

        {/* ── VERDICT ── */}
        {phase === 'verdict' && verdict && (
          <div className="tsg-verdict">
            <div className="tsg-verdict-panel tfc-verdict-panel" style={{ opacity: 0 }}>
              <p className="t-mono t-kyber" style={{ fontSize: 10, letterSpacing: '.4em' }}>◈ THE BEACON'S MEASURE ◈</p>
              <div style={{ margin: '20px auto 0', maxWidth: 360 }}>
                {verdict.fracs.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <span className="t-mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ghost)', width: 64, textAlign: 'right' }}>WAVE {['I', 'II', 'III', 'IV', 'V'][i]}</span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(103,232,249,.09)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${Math.round(f * 100)}%`, background: 'linear-gradient(90deg, var(--ember), var(--kyber))', borderRadius: 2 }} />
                    </div>
                    <span className="t-mono" style={{ fontSize: 9, color: 'var(--kyber-dim)', width: 38 }}>{Math.round(f * 100)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ margin: '22px auto 0', height: 1, maxWidth: 300, background: 'linear-gradient(90deg, transparent, rgba(103,232,249,.4), transparent)' }} />
              <h3 className="t-display" style={{ marginTop: 18, fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 900, letterSpacing: '.1em', color: 'var(--bone)' }}>
                THE BEACON HOLDS
              </h3>
              <p className="t-mono" style={{ marginTop: 10, fontSize: 10, letterSpacing: '.3em', color: 'var(--ember)' }} data-tfc-score={verdict.score}>
                COHERENCE {verdict.coh}% — RANK ECHO +{verdict.score}
              </p>
              <button
                onClick={() => { chime(660, 1, 0.08); onComplete(verdict.score) }}
                data-tfc-claim
                data-cursor="FORGE"
                onMouseEnter={() => blip(true)}
                style={{ marginTop: 24, padding: '13px 38px', background: 'rgba(103,232,249,.08)', border: '1px solid rgba(103,232,249,.5)', color: 'var(--kyber)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', cursor: 'none', borderRadius: 4, transition: 'all .3s' }}
              >
                RETURN TO THE ORBIT ◈
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
