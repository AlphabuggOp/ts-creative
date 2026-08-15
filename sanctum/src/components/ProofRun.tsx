import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { blip, chime, impact, staticBurst } from './audio'

/* ── THE PROOF CHAMBER (E3 MOVE engine) ───────────────────────────
   "Words are cheap. Prove the path." Three steering games on one
   pointer-follow engine:
     SOLO RUN   — thread a drifting debris field; brushes score, hits bleed
     FORMATION  — ferry three escorts inside your halo to the rally ring
     SANCTUARY  — motes fear your light; shepherd them through the gate
   WALL-CLOCK LAW everywhere. Live state rides window.__proof.          */

export type ProofMode = 'solo' | 'formation' | 'sanctuary' | 'scan' | 'broadcast' | 'pyre'
export const PROOF_OF: Record<string, ProofMode> = {
  '0a': 'solo',      // ANSWER ALONE → SOLO RUN
  '0b': 'formation', // RELAY THE FLEET → FORMATION
  '1a': 'sanctuary', // OPEN THE GATE → SANCTUARY
  '1b': 'scan',      // SCAN THEM FIRST → DEEP SCAN
  '2a': 'broadcast', // LET IT BE KNOWN → BROADCAST
  '2b': 'pyre',      // LET IT REST → PYRE
}
export const PROOF_META: Record<ProofMode, { name: string; goal: string }> = {
  solo: { name: 'THE SOLO RUN', goal: 'SURVIVE THE FIELD 10s — brushes feed merit, hits bleed it' },
  formation: { name: 'FORMATION', goal: 'CARRY ALL THREE LIGHTS TO THE RALLY RING — leave no one' },
  sanctuary: { name: 'SANCTUARY', goal: 'THE MOTES FEAR YOU — shepherd 9 of 12 through the gate' },
  scan: { name: 'DEEP SCAN', goal: 'THE COURIER JINKS — hold your reticle on it: burn 3 scan rings' },
  broadcast: { name: 'BROADCAST', goal: 'PUMP IN THE EMBER WINDOW — outrun the jamming; hold output ≥60' },
  pyre: { name: 'PYRE', goal: 'HOLD THE TRUTH IN THE FLAME — sparks will shove it out; burn it whole' },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const EMBER = '232,180,76'
const KYBER = '103,232,249'

type Props = { mode: ProofMode; onDone: (q: number) => void }

export default function ProofRun({ mode, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLSpanElement>(null)
  const [phase, setPhase] = useState<'play' | 'held'>('play')
  const [heldQ, setHeldQ] = useState(0)

  useEffect(() => {
    let alive = true
    const later = (ms: number, fn: () => void) => { const id = window.setTimeout(() => { if (alive) fn() }, ms); timers.push(id) }
    const timers: number[] = []
    gsap.fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 })

    const canvas = cvsRef.current!
    const c2 = canvas.getContext('2d')!
    let W = 0, H = 0
    const fit = () => {
      const r = canvas.getBoundingClientRect()
      W = r.width; H = r.height
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      c2.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    window.addEventListener('resize', fit)

    /* sim truth */
    const sim = {
      px: 0, py: 0, tx: 0, ty: 0, seen: false,      // light + pointer
      t0: performance.now(), dur: mode === 'solo' ? 10 : mode === 'formation' ? 14 : mode === 'scan' ? 18 : mode === 'broadcast' ? 25 : mode === 'pyre' ? 16 : 22,
      done: false, q: 0,
      // solo
      debris: [] as { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; close: boolean; hit: boolean }[],
      spawnAt: 0, hits: 0, near: 0, invulnUntil: 0, shakeT: 0,
      // formation
      escorts: [] as { x: number; y: number; vx: number; vy: number; seed: number; strayT: number; strayAcc: number }[],
      rallyHold: 0,
      // sanctuary
      motes: [] as { x: number; y: number; vx: number; vy: number; saved: boolean; popT: number }[],
      saved: 0,
      // scan
      courier: { x: 0, y: 0, tx: 0, ty: 0, jinkAt: 0 },
      ringsBurned: 0, ringProg: 0,
      // broadcast (E4 PULSE)
      sweepT: 0, output: 0.3, highT: 0, jamAt: 0, jamFlashUntil: 0,
      // pyre
      scroll: { x: 0, y: 0, vx: 0, vy: 0 },
      burn: 0, sparkAt: 0, shove: { x: 0, y: 0 },
      trail: [] as { x: number; y: number }[],
    }
    const gate = { x: 0, y: 0, r: 64 }
    const rally = { x: 0, y: 0, r: 54 }
    const place = () => {
      sim.px = sim.tx = W * 0.5; sim.py = sim.ty = H * 0.6
      if (mode === 'formation') {
        for (let i = 0; i < 3; i++) sim.escorts.push({ x: W * 0.5 - 30 + i * 30, y: H * 0.6 + 44, vx: 0, vy: 0, seed: i * 2.1, strayT: 0, strayAcc: 0 })
        rally.x = W * 0.8; rally.y = H * 0.34; rally.r = 60
      }
      if (mode === 'sanctuary') {
        gate.x = W * 0.5; gate.y = H * 0.18
        for (let i = 0; i < 12; i++) sim.motes.push({ x: W * (0.16 + Math.random() * 0.68), y: H * (0.35 + Math.random() * 0.5), vx: 0, vy: 0, saved: false, popT: 0 })
      }
      if (mode === 'scan') {
        sim.courier.x = W * 0.5; sim.courier.y = H * 0.5
        sim.courier.tx = sim.courier.x; sim.courier.ty = sim.courier.y
        sim.courier.jinkAt = performance.now() + 1400
      }
      if (mode === 'broadcast') sim.jamAt = performance.now() + 2600
      if (mode === 'pyre') {
        sim.scroll.x = W * 0.5; sim.scroll.y = H * 0.8
        sim.sparkAt = performance.now() + 2100
      }
    }
    place()
    window.addEventListener('resize', place)

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      sim.tx = e.clientX - r.left; sim.ty = e.clientY - r.top
      sim.seen = true
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    /* E4 PULSE — broadcast pumps only count in the ember window */
    const onDown = () => {
      if (mode !== 'broadcast' || sim.done) return
      const inWin = (v: number) => v > 0.5 - 0.09 && v < 0.5 + 0.09
      const v = Math.sin(sim.sweepT * 3.1) * 0.5 + 0.5
      if (inWin(v)) {
        sim.output = clamp(sim.output + 0.17, 0, 1)
        chime(392 + sim.output * 300, 0.5, 0.08)
      } else {
        sim.output = clamp(sim.output - 0.08, 0, 1)
        chime(196, 0.5, 0.06)
      }
    }
    window.addEventListener('pointerdown', onDown, { passive: true })

    const finish = () => {
      if (sim.done) return
      sim.done = true
      const q = sim.q
      setHeldQ(q)
      setPhase('held')
      chime(523.25, 1.2, 0.09)
      later(100, () => chime(659.25, 1.3, 0.08))
      later(220, () => chime(783.99, 1.5, 0.07))
      impact(0.12)
      later(1500, () => onDone(q))
    }

    let raf = 0, lastT = performance.now(), lastWall = performance.now(), frame = 0
    const loop = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now
      const wallDt = Math.min(0.5, (now - lastWall) / 1000 || 0.016); lastWall = now
      const el = (now - sim.t0) / 1000
      const remain = Math.max(0, sim.dur - el)

      /* light follows pointer (engine core) */
      sim.px += (sim.tx - sim.px) * 0.14
      sim.py += (sim.ty - sim.py) * 0.14
      sim.trail.push({ x: sim.px, y: sim.py })
      if (sim.trail.length > 26) sim.trail.shift()

      /* ── updates ── */
      if (!sim.done && sim.seen) {
        if (mode === 'solo') {
          if (now > sim.spawnAt) {
            sim.spawnAt = now + 330 + Math.random() * 260 - Math.min(120, el * 14)
            const r = 9 + Math.random() * 17
            sim.debris.push({ x: Math.random() * W, y: -30, vx: (Math.random() * 2 - 1) * 34, vy: 110 + Math.random() * 90 + el * 6, r, rot: Math.random() * 6.28, vr: (Math.random() * 2 - 1) * 2.4, close: false, hit: false })
          }
          for (let i = sim.debris.length - 1; i >= 0; i--) {
            const db = sim.debris[i]
            db.x += db.vx * dt; db.y += db.vy * dt; db.rot += db.vr * dt
            if (db.y > H + 40) { sim.debris.splice(i, 1); continue }
            const d = Math.hypot(db.x - sim.px, db.y - sim.py)
            if (!db.hit && d < db.r + 13 && now > sim.invulnUntil) {
              db.hit = true; sim.hits++
              sim.invulnUntil = now + 800; sim.shakeT = 6
              impact(0.2); staticBurst(0.3, 0.06)
            } else if (!db.close && d < db.r + 62) {
              db.close = true; sim.near++
              blip(true)
            }
          }
          sim.q = clamp(0.42 + sim.near * 0.055 - sim.hits * 0.16, 0.06, 1)
          if (remain <= 0) { sim.q = clamp(sim.q + 0.12, 0.06, 1); finish() }
        }
        if (mode === 'formation') {
          let allIn = true
          for (const e of sim.escorts) {
            const dx = sim.px - e.x, dy = sim.py - e.y
            const m = Math.hypot(dx, dy) || 1
            const wob = Math.sin(now / 700 + e.seed) * 22
            const seek = clamp((m - 40) * 6, 0, 300) // lag — they fall behind if you flee
            e.vx += ((dx / m) * seek + (-dy / m) * wob - e.vx * 3) * dt
            e.vy += ((dy / m) * seek + (dx / m) * wob - e.vy * 3) * dt
            e.x += e.vx * dt; e.y += e.vy * dt
            const inHalo = Math.hypot(e.x - sim.px, e.y - sim.py) < 110
            if (!inHalo) { e.strayT += wallDt; allIn = false }
            else e.strayT = 0
            if (e.strayT > 1) e.strayAcc += wallDt
          }
          const playerAtRally = Math.hypot(sim.px - rally.x, sim.py - rally.y) < rally.r
          if (playerAtRally && allIn) {
            sim.rallyHold += wallDt
            if (sim.rallyHold > 0.35 && frame % 20 === 0) blip(true)
            if (sim.rallyHold >= 1.2) { sim.q = clamp(1.04 - el / sim.dur * 0.42 - sim.escorts.reduce((s, e) => s + e.strayAcc, 0) * 0.09, 0.08, 1); finish() }
          } else sim.rallyHold = Math.max(0, sim.rallyHold - wallDt * 2)
          sim.q = clamp(1.04 - el / sim.dur * 0.42 - sim.escorts.reduce((s, e) => s + e.strayAcc, 0) * 0.09, 0.08, 1)
          if (remain <= 0) finish()
        }
        if (mode === 'sanctuary') {
          let left = 0
          for (const mo of sim.motes) {
            if (mo.saved) continue
            left++
            const dx = mo.x - sim.px, dy = mo.y - sim.py
            const d = Math.hypot(dx, dy) || 1
            const fear = d < 140 ? (1 - d / 140) * 420 : 0
            mo.vx += ((dx / d) * fear + (Math.random() * 2 - 1) * 26 - mo.vx * 2.2) * dt
            mo.vy += ((dy / d) * fear + (Math.random() * 2 - 1) * 26 - mo.vy * 2.2) * dt
            mo.x = clamp(mo.x + mo.vx * dt, 10, W - 10)
            mo.y = clamp(mo.y + mo.vy * dt, 10, H - 10)
            if (Math.hypot(mo.x - gate.x, mo.y - gate.y) < gate.r) {
              mo.saved = true; mo.popT = now; sim.saved++
              chime(660 + sim.saved * 30, 0.7, 0.07)
            }
          }
          sim.q = clamp(sim.saved / 12 * 1.1, 0.05, 1)
          if (left === 0 || remain <= 0) { if (sim.saved >= 9) sim.q = clamp(0.62 + (sim.saved - 9) / 3 * 0.32 + remain / sim.dur * 0.06, 0, 1); finish() }
        }
        if (mode === 'scan') {
          const cr = sim.courier
          /* jinks — sudden sine-burst dashes to a new bearing */
          if (now > cr.jinkAt) {
            cr.jinkAt = now + 1500 + Math.random() * 1100
            cr.tx = W * (0.15 + Math.random() * 0.7)
            cr.ty = H * (0.16 + Math.random() * 0.68)
            blip(false)
          }
          const dx = cr.tx - cr.x, dy = cr.ty - cr.y
          const dist = Math.hypot(dx, dy)
          const sp = Math.min(dist * 3.4 * dt, 230 * dt)
          if (dist > 1) { cr.x += (dx / dist) * sp; cr.y += (dy / dist) * sp }
          /* drift sway between jinks */
          cr.x += Math.sin(now / 620) * 14 * dt
          cr.y += Math.cos(now / 830) * 11 * dt
          const onT = Math.hypot(sim.px - cr.x, sim.py - cr.y) < 54
          if (onT) {
            sim.ringProg += wallDt / 1.5
            if (frame % 18 === 0) blip(true)
            if (sim.ringProg >= 1) {
              sim.ringProg = 0; sim.ringsBurned++
              chime(523 + sim.ringsBurned * 90, 0.8, 0.08)
              impact(0.08)
              if (sim.ringsBurned >= 3) { sim.q = clamp(0.55 + (remain / sim.dur) * 0.45, 0, 1); finish() }
            }
          } else {
            sim.ringProg = Math.max(0, sim.ringProg - wallDt / 2.2)
          }
          sim.q = clamp(sim.ringsBurned / 3 * 0.8 + sim.ringProg / 3 * 0.8 + (sim.ringsBurned >= 3 ? 0 : 0), 0.05, 1)
          if (remain <= 0) finish()
        }
        if (mode === 'broadcast') {
          sim.sweepT += dt
          sim.output = clamp(sim.output - wallDt * 0.022, 0, 1)
          /* jamming pulses — the Empire knocks the needle down */
          if (now > sim.jamAt) {
            sim.jamAt = now + 1700 + Math.random() * 1400
            sim.output = clamp(sim.output - 0.13, 0, 1)
            sim.jamFlashUntil = now + 500
            staticBurst(0.25, 0.05)
          }
          if (sim.output >= 0.6) sim.highT += wallDt
          sim.q = clamp(sim.highT / 6, 0.04, 1)
          if (sim.highT >= 6) { sim.q = clamp(0.6 + (remain / sim.dur) * 0.4, 0, 1); finish() }
          if (remain <= 0) finish()
        }
        if (mode === 'pyre') {
          const fx = W / 2, fy = H * 0.42, fr = 74 // the flame heart
          /* sparks shove the scroll — radial impulse on a slow clock */
          if (now > sim.sparkAt) {
            sim.sparkAt = now + 1400 + Math.random() * 900
            const a = Math.random() * Math.PI * 2
            sim.shove.x = Math.cos(a) * (180 + Math.random() * 130)
            sim.shove.y = Math.sin(a) * (180 + Math.random() * 130)
            impact(0.07)
          }
          /* the scroll chases your light but carries every shove (spring + momentum) */
          const kx = sim.px - sim.scroll.x, ky = sim.py - sim.scroll.y
          sim.scroll.vx += (kx * 26 - sim.scroll.vx * 6.5) * dt + sim.shove.x * dt
          sim.scroll.vy += (ky * 26 - sim.scroll.vy * 6.5) * dt + sim.shove.y * dt
          sim.shove.x *= (1 - dt * 6); sim.shove.y *= (1 - dt * 6)
          sim.scroll.x += sim.scroll.vx * dt; sim.scroll.y += sim.scroll.vy * dt
          const inFlame = Math.hypot(sim.scroll.x - fx, sim.scroll.y - fy) < fr
          if (inFlame) {
            sim.burn += wallDt / 4.2
            if (frame % 22 === 0) blip(true)
          } else {
            sim.burn = Math.max(0, sim.burn - wallDt / 9)
          }
          sim.q = clamp(sim.burn, 0.05, 1)
          if (sim.burn >= 1 || remain <= 0) { sim.q = clamp(sim.burn >= 1 ? 0.7 + (remain / sim.dur) * 0.3 : sim.burn * 0.8, 0.05, 1); finish() }
        }
      }

      /* ── draw ── */
      c2.clearRect(0, 0, W, H)
      const sx = sim.shakeT > 0 ? (Math.random() * 2 - 1) * sim.shakeT : 0
      const sy = sim.shakeT > 0 ? (Math.random() * 2 - 1) * sim.shakeT : 0
      sim.shakeT = Math.max(0, sim.shakeT - 0.4)
      c2.save(); c2.translate(sx, sy)
      // starfield streaks
      c2.fillStyle = `rgba(${KYBER},.25)`
      for (let i = 0; i < 40; i++) {
        const px = (i * 97.3) % W
        const py = ((i * 61.7 + now * (0.02 + (i % 5) * 0.008)) % (H + 20)) - 10
        c2.fillRect(px, py, 1.2, 1.2 + (i % 3))
      }
      const nowS = now / 1000

      if (mode === 'solo') {
        for (const db of sim.debris) {
          if (db.hit) continue
          c2.save(); c2.translate(db.x, db.y); c2.rotate(db.rot)
          c2.strokeStyle = db.close ? `rgba(${EMBER},.9)` : `rgba(${EMBER},.5)`
          c2.lineWidth = db.close ? 1.8 : 1.2
          c2.beginPath()
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2
            const rr = db.r * (0.8 + ((k * 37 + db.vr * 7) % 10) / 45)
            if (k === 0) c2.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
            else c2.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          }
          c2.closePath(); c2.stroke()
          c2.restore()
        }
      }
      if (mode === 'formation') {
        // rally ring
        c2.strokeStyle = `rgba(${EMBER},.8)`; c2.lineWidth = 2
        c2.setLineDash([6, 8])
        c2.beginPath(); c2.arc(rally.x, rally.y, rally.r + Math.sin(nowS * 3) * 3, 0, Math.PI * 2); c2.stroke()
        c2.setLineDash([])
        if (sim.rallyHold > 0) {
          c2.strokeStyle = `rgba(${KYBER},.9)`; c2.lineWidth = 3
          c2.beginPath(); c2.arc(rally.x, rally.y, rally.r + 8, -Math.PI / 2, -Math.PI / 2 + (sim.rallyHold / 1.2) * Math.PI * 2); c2.stroke()
        }
        // halo
        c2.strokeStyle = `rgba(${KYBER},.28)`; c2.lineWidth = 1.4
        c2.beginPath(); c2.arc(sim.px, sim.py, 110, 0, Math.PI * 2); c2.stroke()
        // escorts + tethers
        for (const e of sim.escorts) {
          const inHalo = Math.hypot(e.x - sim.px, e.y - sim.py) < 110
          c2.strokeStyle = `rgba(${KYBER},${inHalo ? 0.25 : 0.5})`
          c2.lineWidth = 1
          c2.beginPath(); c2.moveTo(sim.px, sim.py); c2.lineTo(e.x, e.y); c2.stroke()
          c2.fillStyle = inHalo ? `rgba(${KYBER},.95)` : `rgba(${EMBER},.95)`
          if (!inHalo) { c2.shadowColor = `rgba(${EMBER},.8)`; c2.shadowBlur = 10 }
          c2.beginPath(); c2.arc(e.x, e.y, 5, 0, Math.PI * 2); c2.fill()
          c2.shadowBlur = 0
        }
      }
      if (mode === 'sanctuary') {
        // the gate
        c2.strokeStyle = `rgba(${EMBER},.85)`; c2.lineWidth = 2.4
        c2.beginPath(); c2.arc(gate.x, gate.y, gate.r + Math.sin(nowS * 2.6) * 4, 0, Math.PI * 2); c2.stroke()
        c2.strokeStyle = `rgba(${EMBER},.25)`; c2.lineWidth = 1.2
        c2.beginPath(); c2.arc(gate.x, gate.y, gate.r * 0.72, 0, Math.PI * 2); c2.stroke()
        for (const mo of sim.motes) {
          if (mo.saved) {
            const pt = (now - mo.popT) / 600
            if (pt < 1) {
              c2.strokeStyle = `rgba(${KYBER},${0.8 * (1 - pt)})`
              c2.lineWidth = 2
              c2.beginPath(); c2.arc(mo.x, mo.y, 6 + pt * 26, 0, Math.PI * 2); c2.stroke()
            }
            continue
          }
          c2.fillStyle = `rgba(${KYBER},.9)`
          c2.shadowColor = `rgba(${KYBER},.7)`; c2.shadowBlur = 7
          c2.beginPath(); c2.arc(mo.x, mo.y, 4, 0, Math.PI * 2); c2.fill()
          c2.shadowBlur = 0
        }
        c2.font = '700 12px monospace'
        c2.textAlign = 'center'
        c2.fillStyle = `rgba(${EMBER},.85)`
        c2.fillText(`${sim.saved}/12 · NEED 9`, gate.x, gate.y - gate.r - 12)
      }
      if (mode === 'scan') {
        const cr = sim.courier
        /* the courier — an ember wedge that refuses to hold still */
        c2.save(); c2.translate(cr.x, cr.y)
        const toT = Math.atan2(cr.ty - cr.y, cr.tx - cr.x)
        c2.rotate(Math.abs(cr.tx - cr.x) + Math.abs(cr.ty - cr.y) > 2 ? toT : Math.sin(nowS * 2) * 0.4)
        c2.fillStyle = `rgba(${EMBER},.95)`
        c2.shadowColor = `rgba(${EMBER},.7)`; c2.shadowBlur = 12
        c2.beginPath(); c2.moveTo(12, 0); c2.lineTo(-8, 7); c2.lineTo(-4, 0); c2.lineTo(-8, -7); c2.closePath(); c2.fill()
        c2.restore(); c2.shadowBlur = 0
        /* current scan ring */
        c2.strokeStyle = `rgba(${KYBER},.75)`; c2.lineWidth = 2.4
        c2.beginPath(); c2.arc(cr.x, cr.y, 54, -Math.PI / 2, -Math.PI / 2 + sim.ringProg * Math.PI * 2); c2.stroke()
        for (let i = 0; i < 3; i++) {
          c2.strokeStyle = i < sim.ringsBurned ? `rgba(${KYBER},.95)` : `rgba(${KYBER},.22)`
          c2.lineWidth = i < sim.ringsBurned ? 2.6 : 1.2
          const y = H - 26
          c2.beginPath(); c2.arc(W / 2 - 44 + i * 44, y, 9, 0, Math.PI * 2); c2.stroke()
        }
        /* reticle follows your light */
        c2.strokeStyle = `rgba(${KYBER},.8)`; c2.lineWidth = 1.4
        c2.beginPath(); c2.arc(sim.px, sim.py, 26, 0, Math.PI * 2); c2.stroke()
        c2.beginPath(); c2.moveTo(sim.px - 36, sim.py); c2.lineTo(sim.px - 26, sim.py); c2.moveTo(sim.px + 26, sim.py); c2.lineTo(sim.px + 36, sim.py)
        c2.moveTo(sim.px, sim.py - 36); c2.lineTo(sim.px, sim.py - 26); c2.moveTo(sim.px, sim.py + 26); c2.lineTo(sim.px, sim.py + 36); c2.stroke()
      }
      if (mode === 'broadcast') {
        /* jam flash wash */
        if (now < sim.jamFlashUntil) {
          c2.fillStyle = `rgba(${EMBER},${0.12 * (sim.jamFlashUntil - now) / 500})`
          c2.fillRect(0, 0, W, H)
          c2.font = '700 22px monospace'; c2.textAlign = 'center'
          c2.fillStyle = `rgba(${EMBER},.85)`
          c2.fillText('— JAMMED —', W / 2, H * 0.24)
        }
        /* big output VU */
        const vx = W / 2 - 170, vw = 340, vy = H * 0.62, vh = 26
        c2.strokeStyle = `rgba(${KYBER},.3)`; c2.lineWidth = 1.4
        c2.strokeRect(vx, vy, vw, vh)
        const fillW = vw * sim.output
        c2.fillStyle = sim.output >= 0.6 ? `rgba(${KYBER},.8)` : `rgba(${EMBER},.75)`
        if (sim.output >= 0.6) { c2.shadowColor = `rgba(${KYBER},.7)`; c2.shadowBlur = 14 }
        c2.fillRect(vx + 2, vy + 2, Math.max(0, fillW - 4), vh - 4)
        c2.shadowBlur = 0
        /* the 60% sustain line */
        c2.strokeStyle = `rgba(${KYBER},.9)`; c2.setLineDash([4, 4])
        c2.beginPath(); c2.moveTo(vx + vw * 0.6, vy - 8); c2.lineTo(vx + vw * 0.6, vy + vh + 8); c2.stroke()
        c2.setLineDash([])
        /* sweep bar + ember window */
        const sy = H * 0.78, sh = 34
        c2.strokeStyle = `rgba(${KYBER},.25)`; c2.strokeRect(vx, sy, vw, sh)
        c2.fillStyle = `rgba(${EMBER},.18)`
        c2.fillRect(vx + vw * (0.5 - 0.09), sy, vw * 0.18, sh)
        c2.strokeStyle = `rgba(${EMBER},.75)`; c2.strokeRect(vx + vw * (0.5 - 0.09), sy, vw * 0.18, sh)
        const mv = Math.sin(sim.sweepT * 3.1) * 0.5 + 0.5
        c2.strokeStyle = `rgba(${KYBER},.95)`; c2.lineWidth = 3
        c2.beginPath(); c2.moveTo(vx + vw * mv, sy - 5); c2.lineTo(vx + vw * mv, sy + sh + 5); c2.stroke()
        c2.font = '400 10px monospace'; c2.textAlign = 'center'
        c2.fillStyle = `rgba(${KYBER},.6)`
        c2.fillText(`SUSTAIN ≥60% · HELD ${sim.highT.toFixed(1)}s / 6s — CLICK IN THE EMBER WINDOW`, W / 2, sy + sh + 24)
      }
      if (mode === 'pyre') {
        const fx = W / 2, fy = H * 0.42, fr = 74
        /* the flame heart — breathing ember ring + sparks */
        c2.strokeStyle = `rgba(${EMBER},.85)`; c2.lineWidth = 2.2
        c2.setLineDash([8, 7])
        c2.beginPath(); c2.arc(fx, fy, fr + Math.sin(nowS * 2.4) * 5, 0, Math.PI * 2); c2.stroke()
        c2.setLineDash([])
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + nowS * 0.5
          const rr = fr * 0.5 + ((i * 31 + (now % 900) / 9) % (fr * 0.45))
          c2.fillStyle = `rgba(${EMBER},${0.5 - (rr / fr) * 0.42})`
          c2.fillRect(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr, 2, 2)
        }
        /* the scroll — charring from kyber to ember as it burns */
        const s = sim.scroll
        const burnMix = sim.burn
        c2.save(); c2.translate(s.x, s.y); c2.rotate(Math.sin(nowS * 3) * 0.12 + s.vx * 0.001)
        c2.fillStyle = `rgba(${Math.round(103 + (232 - 103) * burnMix)},${Math.round(232 - 52 * burnMix)},${Math.round(249 - 173 * burnMix)},.95)`
        c2.shadowColor = burnMix > 0.5 ? `rgba(${EMBER},.9)` : `rgba(${KYBER},.8)`; c2.shadowBlur = 14
        c2.fillRect(-16, -11, 32, 22)
        c2.restore(); c2.shadowBlur = 0
        c2.strokeStyle = `rgba(${EMBER},.85)`; c2.lineWidth = 2.6
        c2.beginPath(); c2.arc(fx, fy, fr + 16, -Math.PI / 2, -Math.PI / 2 + sim.burn * Math.PI * 2); c2.stroke()
        c2.font = '400 10px monospace'; c2.textAlign = 'center'
        c2.fillStyle = `rgba(${EMBER},.7)`
        c2.fillText(`BURN ${(Math.min(sim.burn, 1) * 100) | 0}% — HOLD IT IN THE HEART`, fx, fy + fr + 34)
      }

      /* trail + light (all modes) */
      for (let i = 0; i < sim.trail.length; i++) {
        const p = sim.trail[i], a = (i / sim.trail.length) * 0.35
        c2.fillStyle = `rgba(${KYBER},${a})`
        c2.beginPath(); c2.arc(p.x, p.y, 2.6 * (i / sim.trail.length), 0, Math.PI * 2); c2.fill()
      }
      const inv = now < sim.invulnUntil
      c2.fillStyle = inv ? `rgba(${EMBER},.95)` : `rgba(${KYBER},.95)`
      c2.shadowColor = inv ? `rgba(${EMBER},.9)` : `rgba(${KYBER},.9)`; c2.shadowBlur = 16
      c2.beginPath(); c2.arc(sim.px, sim.py, 8, 0, Math.PI * 2); c2.fill()
      c2.shadowBlur = 0
      c2.strokeStyle = `rgba(${KYBER},.6)`; c2.lineWidth = 1.2
      c2.beginPath(); c2.arc(sim.px, sim.py, 13 + Math.sin(nowS * 4) * 1.6, 0, Math.PI * 2); c2.stroke()
      c2.restore()

      /* HUD on slow tick */
      if (++frame % 6 === 0 && hudRef.current) {
        hudRef.current.textContent =
          mode === 'solo' ? `T−${remain.toFixed(1)}s · BRUSHES ${sim.near} · HITS ${sim.hits}`
          : mode === 'formation' ? `T−${remain.toFixed(1)}s · HOLD ${(sim.rallyHold / 1.2 * 100) | 0}% · STRAYS ${sim.escorts.reduce((s, e) => s + e.strayAcc, 0).toFixed(1)}s`
          : mode === 'scan' ? `T−${remain.toFixed(1)}s · RINGS ${sim.ringsBurned}/3 · RING ${(sim.ringProg * 100) | 0}%`
          : mode === 'broadcast' ? `T−${remain.toFixed(1)}s · OUTPUT ${(sim.output * 100) | 0}% · HELD ${sim.highT.toFixed(1)}/6s`
          : mode === 'pyre' ? `T−${remain.toFixed(1)}s · BURN ${(Math.min(sim.burn, 1) * 100) | 0}%`
          : `T−${remain.toFixed(1)}s · SHEPHERDED ${sim.saved}/12`
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    /* console-state read-out */
    ;(window as unknown as { __proof?: unknown }).__proof = {
      mode,
      done: () => sim.done,
      q: () => sim.q,
      pos: () => [sim.px, sim.py],
      remain: () => Math.max(0, sim.dur - (performance.now() - sim.t0) / 1000),
      rect: () => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } },
      // solo
      debris: () => sim.debris.filter((d) => !d.hit).map((d) => [d.x, d.y, d.vy, d.r]),
      hits: () => sim.hits, near: () => sim.near,
      // formation
      escorts: () => sim.escorts.map((e) => [e.x, e.y, e.strayAcc]),
      rally: () => [rally.x, rally.y, rally.r],
      // sanctuary
      motes: () => sim.motes.filter((m) => !m.saved).map((m) => [m.x, m.y]),
      gate: () => [gate.x, gate.y, gate.r],
      saved: () => sim.saved,
      // scan
      courier: () => [sim.courier.x, sim.courier.y],
      rings: () => [sim.ringsBurned, sim.ringProg],
      // broadcast
      sweep: () => Math.sin(sim.sweepT * 3.1) * 0.5 + 0.5,
      output: () => sim.output,
      highT: () => sim.highT,
      // pyre
      scroll: () => [sim.scroll.x, sim.scroll.y],
      flame: () => { const r = canvas.getBoundingClientRect(); return [r.width / 2, r.height * 0.42, 74] },
      burn: () => sim.burn,
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      timers.forEach((id) => clearTimeout(id))
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', fit)
      window.removeEventListener('resize', place)
      delete (window as unknown as { __proof?: unknown }).__proof
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meta = PROOF_META[mode]
  return (
    <div ref={root} data-proof={mode} data-proof-phase={phase}
      style={{ position: 'fixed', inset: 0, zIndex: 84, background: 'rgba(3,5,10,.985)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '18px 20px' }}>
      <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.4em', color: 'var(--ember)' }}>THE PROOF — {meta.name}</p>
      <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.26em', color: 'var(--kyber-dim)' }}>{meta.goal}</p>
      <div style={{ position: 'relative', width: 'min(94vw, 860px)', height: 'min(56vh, 480px)', border: '1px solid rgba(103,232,249,.2)', borderRadius: 10, overflow: 'hidden', background: 'rgba(2,4,8,.6)' }}>
        <canvas ref={cvsRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
        {phase === 'held' && (
          <div className="tch-stamp" style={{ position: 'absolute', left: '50%', top: '46%', translate: '-50% -50%', rotate: '-9deg', padding: '13px 30px', border: '2px solid rgba(103,232,249,.9)', borderRadius: 6, background: 'rgba(6,9,16,.7)', textAlign: 'center', pointerEvents: 'none' }}>
            <p className="t-mono" style={{ fontSize: 13, letterSpacing: '.34em', color: 'var(--kyber)', fontWeight: 700 }}>PROOF HELD</p>
            <p className="t-mono" style={{ marginTop: 6, fontSize: 9, letterSpacing: '.26em', color: 'var(--bone)' }}>MERIT {(heldQ * 100) | 0}%</p>
          </div>
        )}
      </div>
      <span ref={hudRef} className="t-mono" style={{ fontSize: 10, letterSpacing: '.26em', color: 'var(--ghost)', minHeight: '1.2em' }} />
      <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.85 }}>
        <span style={{ color: 'var(--ember)' }}>YOUR LIGHT FOLLOWS YOUR HAND</span> — deeds, not words
      </p>
    </div>
  )
}
