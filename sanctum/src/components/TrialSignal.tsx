import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Draggable, InertiaPlugin } from 'gsap/all'
import Scramble from './Scramble'
import { questEvent } from '../game/quests'
import { useSanctum } from '../store'
import { blip, chime, impact, riser, signalScope, staticBurst } from './audio'

gsap.registerPlugin(Draggable, InertiaPlugin)

/* ── TRIAL OF SIGNAL — the transmission in full ─────────────────────
   The sealed dial IS the instrument: drag-rotate to break the seal,
   then sweep the band through FIVE fragments:
     I    the signal waits (still carrier, teaches the sweep)
     II   it slips (Among-Us retunes, telegraphed ghost arcs)
     III  it runs (retunes + void drift)
     IV   they talk over each other (TWO stations live at once —
          isolate each voice; both must be caught)
     V    the last words are ciphered (a Caesar wheel — drag the
          alphabet until the dead words wake)
   Then the MASTER BAND unlocks: an endless retune ladder with a
   streak multiplier; best streak persists and feeds the Field Log. */

export const FRAGMENTS = [
  'THE NETWORK BREATHES BECAUSE YOU LISTEN.',
  'WHAT THE EMPIRE HEARS IS STATIC. WHAT WE HEAR IS SONG.',
  'CARRY THE SIGNAL FORWARD. THE SANCTUM REMEMBERS.',
  'TWO VOICES SHARE ONE SONG. LEARN THEM APART — BOTH MUST BE HEARD.',
  'THE LAST WORDS SLEPT IN CIPHER, SO THE EMPIRE READ ONLY SILENCE.',
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

type RoundDef = { win: number; drift: number; hop: number; tag: string; tconst: number; dual?: boolean; cipher?: boolean }
const ROUNDS: RoundDef[] = [
  { win: 6.5, drift: 0, hop: 0, tag: '— THE SIGNAL WAITS', tconst: 26 },
  { win: 4.8, drift: 0, hop: 6.2, tag: '— IT SLIPS', tconst: 31 },
  { win: 3.6, drift: 9.5, hop: 8, tag: '— IT RUNS', tconst: 34 },
  { win: 4.4, drift: 0, hop: 7.2, dual: true, tag: '— THEY TALK OVER EACH OTHER', tconst: 46 },
  { win: 0, drift: 0, hop: 0, cipher: true, tag: '— THE LAST WORDS ARE CIPHERED', tconst: 40 },
]
const SEAL_ARC = 220      // accumulated drag degrees to break the seal
const LOCK_SECS = 1.15    // hold-in-window time to catch
const CIPHER_SECS = 0.85  // hold on the true detent to decrypt
const ASSIST_AT = 18      // seconds before the Archivist widens the window
const DET = 360 / 26      // cipher wheel detent step
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CIPHER_PLAIN = FRAGMENTS[4].slice(0, 12) // 'THE LAST WOR'
const shiftTxt = (txt: string, s: number) =>
  txt.split('').map((c) => (/[A-Z]/.test(c) ? ALPHA[(ALPHA.indexOf(c) + ((s % 26) + 26)) % 26] : c)).join('')

const EMBER = [232, 180, 76] as const
const KYBER = [103, 232, 249] as const
const lerpC = (t: number, a = 1) =>
  `rgba(${Math.round(EMBER[0] + (KYBER[0] - EMBER[0]) * t)},${Math.round(EMBER[1] + (KYBER[1] - EMBER[1]) * t)},${Math.round(EMBER[2] + (KYBER[2] - EMBER[2]) * t)},${a})`
const rad = (d: number) => (d * Math.PI) / 180
const mod360 = (d: number) => ((d % 360) + 360) % 360
const wrapDiff = (a: number, b: number) => {
  let d = (a - b) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Phase = 'seal' | 'tune' | 'catch' | 'verdict'
type Props = { onExit: () => void; onComplete: (score: number) => void }

const PHASE_TITLE: Record<Phase, string> = {
  seal: 'BREAK THE SEAL',
  tune: 'TUNE THE STATIC',
  catch: 'FRAGMENT CAUGHT',
  verdict: 'TRANSMISSION RESTORED',
}

export default function TrialSignal({ onExit, onComplete }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const proxyRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const lockRef = useRef<HTMLSpanElement>(null)
  const cipherRef = useRef<HTMLParagraphElement>(null)
  const decodeRef = useRef<HTMLParagraphElement>(null)
  const masterStartRef = useRef<(() => void) | null>(null)

  const [phase, setPhase] = useState<Phase>('seal')
  const [round, setRound] = useState(0)
  const [caught, setCaught] = useState<string[]>([])
  const [assistNote, setAssistNote] = useState(false)
  const [slipNote, setSlipNote] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<{ score: number; acuity: number } | null>(null)
  const [mHud, setMHud] = useState<{ streak: number; score: number; best: number } | null>(null)

  /* mutable sim truth — the rAF loop and GSAP both read/write this */
  const sim = useRef({
    rot: 0,
    sealAcc: 0,
    seal: 0,
    openV: 0,
    /* station A */
    target: 180,
    effTarget: 180,
    win: ROUNDS[0].win,
    drift: 0,
    hopEvery: 0,
    lock: 0,
    clarity: 0,
    /* station B (round IV — the second voice) */
    target2: 180,
    effTarget2: 180,
    lock2: 0,
    clarity2: 0,
    dual: false,
    caughtA: false,
    caughtB: false,
    /* cipher (round V) */
    cipher: false,
    cipherShift: 4,
    /* master band */
    master: false,
    streak: 0,
    mScore: 0,
    mBest: 0,
    depth: 0,
    /* flow */
    tune01: 0.5,
    dragging: false,
    assisted: false,
    qualities: [] as number[],
    caughtN: 0,
    round: 0,
    roundStart: 0,
    phase: 'seal' as Phase,
    hopAt: Infinity,    // next random retune moment (station A)
    hopAt2: Infinity,   // station B
    deadUntil: 0,       // carrier dead-time right after a hop (the slip)
    deadUntil2: 0,
    ghostAt: 0,         // where the frequency WAS — drawn fading so you see it move
    ghostTime: -1e9,
    ghostAt2: 0,
    ghostTime2: -1e9,
  }).current

  useEffect(() => {
    let alive = true
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => { if (alive) fn() }, ms)
      timers.push(id)
    }
    const goPhase = (p: Phase) => { sim.phase = p; setPhase(p) }
    sim.mBest = useSanctum.getState().masterBest

    /* ── entrance (state-driven: nodes committed above) ── */
    gsap.fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' })
    gsap.fromTo('.tsg-in > *', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'power2.out', delay: 0.15 })

    /* ── canvas ── */
    const canvas = canvasRef.current!
    const c2 = canvas.getContext('2d')!
    let cssW = 0
    const fitCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      cssW = rect.width
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      c2.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fitCanvas()
    window.addEventListener('resize', fitCanvas)

    /* particles + burst rings */
    const parts: { a: number; r: number; spd: number; life: number; t: number; sz: number; warm: boolean }[] = []
    const rings: { t: number }[] = []
    const spawnBurst = (r0: number) => {
      for (let i = 0; i < 46; i++) {
        parts.push({
          a: Math.random() * Math.PI * 2, r: r0, spd: 60 + Math.random() * 190,
          life: 0.8 + Math.random() * 0.7, t: 0, sz: 0.8 + Math.random() * 2.4,
          warm: Math.random() < 0.25,
        })
      }
      rings.length = 0
      rings.push({ t: 0 })
    }

    /* ── Draggable: seal first, tuner after the break ── */
    let tuneDrag: Draggable | null = null
    let scatter: gsap.core.Tween | null = null
    /* Draggable rotation exposes `this.rotation` (not deltaRotation — that
       property silently reads undefined and poisons math with NaN). */
    let lastSealRot = 0
    const sealDrag = Draggable.create(proxyRef.current!, {
      type: 'rotation',
      trigger: faceRef.current!,
      onPress() { lastSealRot = this.rotation; sim.dragging = true },
      onDrag() {
        const r = this.rotation
        const d = r - lastSealRot
        lastSealRot = r
        if (!Number.isFinite(d)) return
        sim.sealAcc += Math.abs(d)
        sim.rot += d // ticks creep as you work the seal
        sim.seal = clamp(sim.sealAcc / SEAL_ARC, 0, 1)
        if (sim.seal >= 1 && sim.phase === 'seal') breakSeal()
      },
      onDragEnd() { sim.dragging = false },
    })[0]

    const mkTuner = () => {
      let rotOff = 0 // continuity: the fresh Draggable starts at 0 but the dial doesn't
      tuneDrag = Draggable.create(proxyRef.current!, {
        type: 'rotation',
        trigger: faceRef.current!,
        inertia: true,
        onPress() {
          sim.dragging = true
          scatter?.kill()
          rotOff = sim.rot - this.rotation
          faceRef.current?.classList.add('is-drag')
        },
        onDrag() { sim.rot = rotOff + this.rotation },
        onThrowUpdate() { sim.rot = rotOff + this.rotation },
        onDragEnd() { if (!this.isThrowing) sim.dragging = false; faceRef.current?.classList.remove('is-drag') },
        onThrowComplete() { sim.dragging = false },
      })[0]
    }

    function breakSeal() {
      sealDrag.kill()
      goPhase('tune')
      impact(0.22)
      staticBurst(0.5, 0.07)
      chime(392, 1.4, 0.07)
      gsap.to(sim, { openV: 1, duration: 0.75, ease: 'expo.out' })
      mkTuner()
      later(650, () => beginRound(0))
    }

    function beginRound(i: number) {
      sim.round = i
      setRound(i)
      const R = ROUNDS[i]
      sim.dual = !!R.dual
      sim.cipher = !!R.cipher
      sim.caughtA = sim.caughtB = false
      sim.win = R.win
      sim.drift = R.drift
      sim.hopEvery = R.hop
      sim.lock = 0
      sim.lock2 = 0
      sim.assisted = false
      setAssistNote(false)
      setSlipNote(false)
      setFlash(null)
      sim.roundStart = performance.now()
      if (R.cipher) {
        // the last words arrived encrypted — pick a shift and wake them
        sim.cipherShift = 3 + Math.floor(Math.random() * 20)
        sim.hopAt = Infinity
        sim.hopAt2 = Infinity
        sim.clarity = 0
        setFlash('THE LAST FRAGMENT WORE A CIPHER — TURN THE WHEEL UNTIL THE WORDS WAKE')
        later(4600, () => setFlash(null))
        chime(233.08, 1.6, 0.06)
      } else {
        const prev = sim.target
        do { sim.target = 30 + Math.random() * 300 } while (i > 0 && Math.abs(wrapDiff(sim.target, prev)) < 70)
        if (R.dual) {
          // two voices, planted apart so both are findable
          do { sim.target2 = 30 + Math.random() * 300 } while (Math.abs(wrapDiff(sim.target2, sim.target)) < 85)
          sim.hopAt2 = sim.roundStart + 4200 + R.hop * 700 * (0.8 + Math.random() * 0.6)
          setFlash('TWO VOICES BLEED THROUGH THE STATIC — ISOLATE EACH ONE')
          later(4600, () => setFlash(null))
        }
        sim.effTarget = sim.target
        sim.effTarget2 = sim.target2
        sim.hopAt = R.hop ? sim.roundStart + 2600 + R.hop * 700 * (0.8 + Math.random() * 0.6) : Infinity
      }
      goPhase('tune')
      tuneDrag?.enable()
      // the chamber scatters the dial to a fresh station
      scatter?.kill()
      scatter = gsap.to(sim, {
        rot: sim.rot + (150 + Math.random() * 170) * (Math.random() < 0.5 ? -1 : 1),
        duration: 1.05, ease: 'power3.inOut',
      })
      riser(0.85, 0.045)
      staticBurst(0.4, 0.04)
    }

    /* one station's lock completed */
    function catchStation(which: 1 | 2) {
      if (which === 1) { sim.caughtA = true; sim.lock = 0 }
      else { sim.caughtB = true; sim.lock2 = 0 }
      const R = cssW / 2 - 26
      spawnBurst(R * 0.58 + 15)
      chime(523.25, 1.1, 0.09)
      later(120, () => chime(783.99, 1.3, 0.07))
      impact(0.11)
      staticBurst(0.3, 0.05)
      if (sim.caughtA && sim.caughtB) {
        finalizeRound()
      } else {
        setFlash(which === 1 ? 'VOICE I ISOLATED ◈ ONE REMAINS' : 'VOICE II ISOLATED ◈ ONE REMAINS')
        later(2200, () => setFlash(null))
      }
    }

    /* round complete: score it, push the fragment, advance */
    function finalizeRound() {
      goPhase('catch')
      tuneDrag?.disable()
      setSlipNote(false)
      setFlash(null)
      if (!sim.master) {
        const secs = (performance.now() - sim.roundStart) / 1000
        questEvent({ type: 'signal-lock', secs }) // quick-dial quest listens
        let q = clamp(1.12 - secs / ROUNDS[sim.round].tconst, 0.25, 1)
        if (sim.assisted) q = Math.min(q, 0.55)
        sim.qualities.push(q)
        sim.caughtN++
        setCaught((c) => [...c, FRAGMENTS[sim.round]])
        const R = cssW / 2 - 26
        spawnBurst(R * 0.58 + 15)
        chime(523.25, 1.1, 0.1)
        later(95, () => chime(659.25, 1.2, 0.09))
        later(190, () => chime(783.99, 1.4, 0.08))
        later(300, () => chime(1046.5, 1.8, 0.06))
        impact(0.13)
        later(3000, () => {
          if (sim.round >= ROUNDS.length - 1) showVerdict()
          else beginRound(sim.round + 1)
        })
      } else {
        // master band: the ladder climbs — the streak multiplies the run
        sim.streak++
        sim.mScore += sim.streak
        if (sim.streak > sim.mBest) {
          sim.mBest = sim.streak
          useSanctum.getState().setMasterBest(sim.streak)
          questEvent({ type: 'master' })
        }
        setMHud({ streak: sim.streak, score: sim.mScore, best: sim.mBest })
        setCaught((c) => [...c.slice(-2), `STATION ${sim.depth} CLEANSED — THE LADDER CLIMBS ×${sim.streak}`])
        const R = cssW / 2 - 26
        spawnBurst(R * 0.58 + 15)
        const base = 440 * Math.pow(1.0595, Math.min(14, sim.streak * 2)) // semitone climb
        chime(base, 0.9, 0.1)
        later(90, () => chime(base * 1.25, 1, 0.08))
        later(180, () => chime(base * 1.5, 1.2, 0.07))
        impact(0.1 + Math.min(0.1, sim.streak * 0.01))
        later(1500, () => beginMasterStation())
      }
    }

    function beginMasterStation() {
      sim.depth++
      const d = sim.depth
      sim.dual = false
      sim.cipher = false
      sim.caughtA = sim.caughtB = false
      sim.win = Math.max(2.8, 5.4 - d * 0.35)
      sim.hopEvery = d >= 2 ? Math.max(3.4, 7.6 - d * 0.5) : 0
      sim.drift = d >= 3 ? 5 + Math.random() * 7 : 0
      sim.target = 30 + Math.random() * 300
      sim.effTarget = sim.target
      sim.lock = 0
      sim.lock2 = 0
      sim.assisted = false
      sim.roundStart = performance.now()
      sim.hopAt = sim.hopEvery ? sim.roundStart + 2400 + sim.hopEvery * 700 * (0.8 + Math.random() * 0.6) : Infinity
      goPhase('tune')
      tuneDrag?.enable()
      scatter?.kill()
      scatter = gsap.to(sim, {
        rot: sim.rot + (160 + Math.random() * 180) * (Math.random() < 0.5 ? -1 : 1),
        duration: 0.95, ease: 'power3.inOut',
      })
      riser(0.7, 0.04)
    }

    function showVerdict() {
      goPhase('verdict')
      const total = sim.qualities.reduce((a, b) => a + b, 0)
      const score = Math.round(total * (3 / ROUNDS.length))
      setVerdict({ score, acuity: Math.round((total / ROUNDS.length) * 100) })
      chime(261.63, 2.4, 0.08)
      later(140, () => chime(329.63, 2.4, 0.07))
      later(280, () => chime(392, 2.6, 0.07))
      later(430, () => chime(523.25, 3, 0.06))
    }

    /* keyboard — arrows nudge the dial; they also work the seal */
    let lastKeyBlip = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sim.phase !== 'verdict') onExit()
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const step = (e.shiftKey ? 0.4 : 1.4) * (e.key === 'ArrowLeft' ? -1 : 1)
      scatter?.kill()
      sim.rot += step
      if (sim.phase === 'seal') {
        sim.sealAcc += Math.abs(step) * 3
        sim.seal = clamp(sim.sealAcc / SEAL_ARC, 0, 1)
        if (sim.seal >= 1) breakSeal()
      }
      const now = performance.now()
      if (now - lastKeyBlip > 90) { lastKeyBlip = now; blip(step > 0) }
    }
    window.addEventListener('keydown', onKey)

    /* ── audio scope (lazy — builds once the context truly runs) ── */
    let scope: { set: (c: number, t: number) => void; stop: () => void } | null = null

    /* hop one station elsewhere — telegraphed by a ghost arc + beat of dead air */
    const doHop = (which: 1 | 2, now: number) => {
      const lockV = which === 1 ? sim.lock : sim.lock2
      if (lockV >= 0.6) {
        if (which === 1) sim.hopAt = now + 2000
        else sim.hopAt2 = now + 2000
        return // mercy — never snatch a nearly-caught lock; try again later
      }
      const driftHere = which === 1 ? sim.drift : 0
      const span = (driftHere ? 45 + Math.random() * 50 : 55 + Math.random() * 70) * (Math.random() < 0.5 ? -1 : 1)
      if (which === 1) {
        sim.ghostAt = sim.effTarget
        sim.ghostTime = now
        sim.target = mod360(sim.target + span)
        sim.deadUntil = now + 420
        sim.hopAt = now + sim.hopEvery * 1000 * (0.75 + Math.random() * 0.7)
      } else {
        sim.ghostAt2 = sim.effTarget2
        sim.ghostTime2 = now
        sim.target2 = mod360(sim.target2 + span)
        sim.deadUntil2 = now + 420
        sim.hopAt2 = now + sim.hopEvery * 1000 * (0.75 + Math.random() * 0.7)
      }
      if (!sim.dragging) {
        scatter?.kill()
        scatter = gsap.to(sim, { rot: sim.rot + span * 0.25, duration: 0.35, ease: 'power2.out' })
      }
      staticBurst(0.34, 0.065)
      blip(false)
      setSlipNote(true)
      later(1500, () => setSlipNote(false))
    }

    /* ── the loop ── */
    let raf = 0
    let lastT = performance.now()
    let lastWall = performance.now()
    let frame = 0

    const draw = (now: number) => {
      const w = cssW
      if (!w) return
      const t = now / 1000
      const cx = w / 2
      const cy = w / 2
      const R = w / 2 - 26
      const cl = sim.clarity
      const cl2 = sim.clarity2

      c2.clearRect(0, 0, w, w)

      /* face disc + rim */
      const gFace = c2.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
      gFace.addColorStop(0, 'rgba(9,14,25,.95)')
      gFace.addColorStop(1, 'rgba(4,6,12,.6)')
      c2.fillStyle = gFace
      c2.beginPath(); c2.arc(cx, cy, R, 0, Math.PI * 2); c2.fill()
      c2.strokeStyle = 'rgba(103,232,249,.16)'
      c2.lineWidth = 2
      c2.beginPath(); c2.arc(cx, cy, R - 2, 0, Math.PI * 2); c2.stroke()
      /* slow grip dashes */
      c2.save()
      c2.translate(cx, cy); c2.rotate(rad(t * 3)); c2.translate(-cx, -cy)
      c2.strokeStyle = 'rgba(103,232,249,.22)'
      c2.setLineDash([3, 9])
      c2.lineWidth = 1.4
      c2.beginPath(); c2.arc(cx, cy, R - 9, 0, Math.PI * 2); c2.stroke()
      c2.restore()
      c2.setLineDash([])

      /* the tick ring rotates with the dial (cipher wheel rides it instead) */
      c2.save()
      c2.translate(cx, cy)
      c2.rotate(rad(sim.rot))
      if (sim.cipher) {
        c2.font = `600 ${Math.max(9, w * 0.021)}px monospace`
        c2.textAlign = 'center'
        c2.textBaseline = 'middle'
        const kNow = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
        for (let i = 0; i < 26; i++) {
          const a = rad(i * DET - 90)
          const onLens = i === kNow
          const rr = R - 44
          c2.fillStyle = onLens ? 'rgba(232,180,76,.95)' : 'rgba(103,232,249,.34)'
          c2.save()
          c2.translate(Math.cos(a) * rr, Math.sin(a) * rr)
          c2.rotate(a + Math.PI / 2)
          c2.fillText(ALPHA[i], 0, 0)
          c2.restore()
          c2.strokeStyle = onLens ? 'rgba(232,180,76,.8)' : 'rgba(103,232,249,.18)'
          c2.lineWidth = onLens ? 2 : 1
          c2.beginPath()
          c2.moveTo(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26))
          c2.lineTo(Math.cos(a) * (R - 33), Math.sin(a) * (R - 33))
          c2.stroke()
        }
      } else {
        for (let i = 0; i < 60; i++) {
          const major = i % 5 === 0
          c2.save()
          c2.rotate(rad(i * 6))
          c2.strokeStyle = `rgba(103,232,249,${major ? 0.32 : 0.13})`
          c2.lineWidth = major ? 1.7 : 1
          c2.beginPath(); c2.moveTo(0, -(R - 26)); c2.lineTo(0, -(R - 26) + (major ? 13 : 7)); c2.stroke()
          c2.restore()
        }
      }
      c2.restore()

      /* beam — needle to the scope when a carrier is near */
      const faceR = R * 0.58
      if (cl > 0.04 && sim.phase !== 'seal') {
        const gBeam = c2.createLinearGradient(cx, 46, cx, cy - faceR)
        gBeam.addColorStop(0, lerpC(cl, 0.55 * cl))
        gBeam.addColorStop(1, lerpC(cl, 0))
        c2.strokeStyle = gBeam
        c2.lineWidth = 2 + cl * 2
        c2.beginPath(); c2.moveTo(cx, 46); c2.lineTo(cx, cy - faceR - 6); c2.stroke()
      }
      if (sim.dual && sim.phase === 'tune') {
        /* the second voice beams at its own angle */
        const a2 = rad(-90 + wrapDiff(sim.effTarget2, mod360(sim.rot)))
        const gB2 = c2.createLinearGradient(cx, cy, cx + Math.cos(a2) * (R - 40), cy + Math.sin(a2) * (R - 40))
        gB2.addColorStop(0, `rgba(103,232,249,${0.4 * cl2})`)
        gB2.addColorStop(1, 'rgba(103,232,249,0)')
        c2.strokeStyle = gB2
        c2.lineWidth = 1.6 + cl2 * 2
        c2.beginPath()
        c2.moveTo(cx + Math.cos(a2) * faceR, cy + Math.sin(a2) * faceR)
        c2.lineTo(cx + Math.cos(a2) * (R - 36), cy + Math.sin(a2) * (R - 36))
        c2.stroke()
      }
      /* needle — fixed at 12 o'clock */
      c2.fillStyle = lerpC(Math.max(cl, sim.cipher ? 0.5 : 0) * 0.85, 0.95)
      c2.beginPath(); c2.moveTo(cx - 8, 14); c2.lineTo(cx + 8, 14); c2.lineTo(cx, 44); c2.closePath(); c2.fill()

      /* target zones on the dial */
      const zoneCenter = rad(-90 + wrapDiff(sim.effTarget, mod360(sim.rot)))
      if (sim.assisted && sim.phase === 'tune' && !sim.cipher && !(sim.dual && sim.caughtA)) {
        c2.strokeStyle = 'rgba(232,180,76,.34)'
        c2.lineWidth = 3.4
        c2.beginPath(); c2.arc(cx, cy, R - 33, zoneCenter - rad(sim.win * 2.2), zoneCenter + rad(sim.win * 2.2)); c2.stroke()
      }
      if (sim.dual && sim.phase === 'tune') {
        /* voice pips — fade in with each station's clarity; solid when caught */
        const pip = (ang: number, rr: number, caughtIt: boolean, clV: number, warm: boolean) => {
          const x = cx + Math.cos(ang) * rr
          const y = cy + Math.sin(ang) * rr
          c2.save()
          c2.translate(x, y)
          c2.rotate(ang + Math.PI / 2)
          const a = caughtIt ? 0.95 : 0.15 + clV * 0.7
          c2.fillStyle = warm ? `rgba(232,180,76,${a})` : `rgba(103,232,249,${a})`
          c2.beginPath()
          c2.moveTo(0, -6); c2.lineTo(4.4, 0); c2.lineTo(0, 6); c2.lineTo(-4.4, 0)
          c2.closePath(); c2.fill()
          if (caughtIt) {
            c2.strokeStyle = warm ? 'rgba(232,180,76,.9)' : 'rgba(103,232,249,.9)'
            c2.lineWidth = 1.2
            c2.stroke()
          }
          c2.restore()
        }
        const zone2 = rad(-90 + wrapDiff(sim.effTarget2, mod360(sim.rot)))
        if (!sim.caughtA || true) pip(zoneCenter, R - 33, sim.caughtA, cl, true)
        pip(zone2, R - 40, sim.caughtB, cl2, false)
        if (sim.assisted && !sim.caughtB) {
          c2.strokeStyle = 'rgba(103,232,249,.3)'
          c2.lineWidth = 3
          c2.beginPath(); c2.arc(cx, cy, R - 40, zone2 - rad(sim.win * 2.2), zone2 + rad(sim.win * 2.2)); c2.stroke()
        }
      }
      /* ghosts — where each frequency just slipped FROM (fades fast) */
      const ghost = (gAt: number, gTime: number, rr: number, warm: boolean) => {
        const ghostA = 1 - (now - gTime) / 850
        if (ghostA <= 0 || sim.phase !== 'tune') return
        const gc = rad(-90 + wrapDiff(gAt, mod360(sim.rot)))
        const col = warm ? '232,180,76' : '103,232,249'
        c2.strokeStyle = `rgba(${col},${0.42 * ghostA})`
        c2.lineWidth = 3
        c2.beginPath(); c2.arc(cx, cy, rr, gc - rad(sim.win * 2.6), gc + rad(sim.win * 2.6)); c2.stroke()
        c2.strokeStyle = `rgba(${col},${0.16 * ghostA})`
        c2.lineWidth = 1.2
        c2.beginPath(); c2.arc(cx, cy, rr - 7, gc - rad(sim.win * 3.4), gc + rad(sim.win * 3.4)); c2.stroke()
      }
      ghost(sim.ghostAt, sim.ghostTime, R - 33, true)
      if (sim.dual) ghost(sim.ghostAt2, sim.ghostTime2, R - 40, false)

      /* scope */
      c2.save()
      c2.beginPath(); c2.arc(cx, cy, faceR, 0, Math.PI * 2); c2.clip()
      c2.fillStyle = 'rgba(2,4,8,.88)'
      c2.fillRect(cx - faceR, cy - faceR, faceR * 2, faceR * 2)
      c2.strokeStyle = 'rgba(103,232,249,.07)'
      c2.lineWidth = 1
      c2.beginPath(); c2.moveTo(cx - faceR, cy); c2.lineTo(cx + faceR, cy); c2.stroke()
      c2.beginPath(); c2.moveTo(cx, cy - faceR); c2.lineTo(cx, cy + faceR); c2.stroke()

      if (sim.openV > 0.25 && !sim.cipher) {
        const amp = faceR * (sim.phase === 'catch' || sim.phase === 'verdict' ? 0.3 : 0.26)
        const hw = faceR * 0.86
        const steps = 150
        const maxCl = sim.dual ? Math.max(cl, cl2) : cl
        const nAmp = faceR * 0.4 * (1 - maxCl)
        /* static snow specks at very low clarity */
        if (maxCl < 0.5 && sim.phase === 'tune') {
          c2.fillStyle = lerpC(maxCl * 0.5, 0.3 * (1 - maxCl))
          for (let i = 0; i < 26 * (1 - maxCl); i++) {
            c2.fillRect(cx + (Math.random() * 2 - 1) * hw, cy + (Math.random() * 2 - 1) * faceR * 0.7, 1.3, 1.3)
          }
        }
        /* trace A — voice one (warm lineage) */
        c2.beginPath()
        for (let i = 0; i <= steps; i++) {
          const x = -hw + (i / steps) * hw * 2
          const pure = Math.sin(x * 0.1 + t * 4.6) * amp + Math.sin(x * 0.023 - t * 1.7) * amp * 0.38
          const noise = (Math.random() * 2 - 1) * nAmp
          const y = cy + pure * cl + noise
          if (i === 0) c2.moveTo(cx + x, y)
          else c2.lineTo(cx + x, y)
        }
        c2.strokeStyle = lerpC(cl, 0.95)
        c2.lineWidth = 1.8
        if (cl > 0.55) { c2.shadowColor = lerpC(cl, 0.8); c2.shadowBlur = 11 }
        c2.stroke()
        c2.shadowBlur = 0
        if (sim.dual && sim.phase !== 'seal') {
          /* trace B — voice two (cold lineage, its own heartbeat) */
          c2.beginPath()
          for (let i = 0; i <= steps; i += 2) {
            const x = -hw + (i / steps) * hw * 2
            const pure = Math.sin(x * 0.14 - t * 3.1) * amp * 0.8 + Math.sin(x * 0.031 + t * 2.3) * amp * 0.3
            const noise = (Math.random() * 2 - 1) * faceR * 0.34 * (1 - cl2)
            const y = cy + pure * cl2 + noise
            if (i === 0) c2.moveTo(cx + x, y)
            else c2.lineTo(cx + x, y)
          }
          c2.strokeStyle = `rgba(103,232,249,${0.25 + cl2 * 0.7})`
          c2.lineWidth = 1.4
          if (cl2 > 0.55) { c2.shadowColor = 'rgba(103,232,249,.8)'; c2.shadowBlur = 9 }
          c2.stroke()
          c2.shadowBlur = 0
        } else {
          /* ghost harmonic */
          c2.beginPath()
          for (let i = 0; i <= steps; i += 2) {
            const x = -hw + (i / steps) * hw * 2
            const y = cy + Math.sin(x * 0.17 - t * 5.4) * amp * 0.45 * cl + (Math.random() * 2 - 1) * nAmp * 0.6
            if (i === 0) c2.moveTo(cx + x, y)
            else c2.lineTo(cx + x, y)
          }
          c2.strokeStyle = lerpC(cl, 0.25)
          c2.lineWidth = 1
          c2.stroke()
        }
      }
      c2.restore()
      /* scope rim */
      c2.strokeStyle = 'rgba(103,232,249,.2)'
      c2.lineWidth = 1.2
      c2.beginPath(); c2.arc(cx, cy, faceR, 0, Math.PI * 2); c2.stroke()
      /* center sigil / cipher mapping heart */
      if (sim.cipher) {
        const k = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
        const cGlyph = shiftTxt(CIPHER_PLAIN, sim.cipherShift)[0]
        const pGlyph = shiftTxt(cGlyph, -k)
        const hit = k === sim.cipherShift
        c2.font = `700 ${Math.max(20, w * 0.055)}px monospace`
        c2.textAlign = 'center'
        c2.textBaseline = 'middle'
        c2.fillStyle = hit ? 'rgba(103,232,249,.98)' : 'rgba(232,180,76,.85)'
        if (hit) { c2.shadowColor = 'rgba(103,232,249,.9)'; c2.shadowBlur = 16 }
        c2.fillText(pGlyph, cx - faceR * 0.3, cy)
        c2.shadowBlur = 0
        c2.font = `400 ${Math.max(11, w * 0.026)}px monospace`
        c2.fillStyle = 'rgba(103,232,249,.5)'
        c2.fillText('⟵', cx, cy)
        c2.font = `700 ${Math.max(20, w * 0.055)}px monospace`
        c2.fillStyle = hit ? 'rgba(103,232,249,.9)' : 'rgba(232,180,76,.4)'
        c2.fillText(cGlyph, cx + faceR * 0.3, cy)
        c2.font = `400 ${Math.max(8, w * 0.018)}px monospace`
        c2.fillStyle = 'rgba(103,232,249,.4)'
        c2.fillText(`SHIFT ${String(k).padStart(2, '0')}`, cx, cy + faceR * 0.42)
      } else {
        c2.save()
        c2.translate(cx, cy)
        c2.strokeStyle = 'rgba(103,232,249,.5)'
        c2.lineWidth = 1
        c2.beginPath()
        c2.moveTo(0, -9); c2.lineTo(2.6, -2.6); c2.lineTo(9, 0); c2.lineTo(2.6, 2.6)
        c2.lineTo(0, 9); c2.lineTo(-2.6, 2.6); c2.lineTo(-9, 0); c2.lineTo(-2.6, -2.6)
        c2.closePath(); c2.stroke()
        c2.restore()
      }

      /* lock progress rings (station A outer, station B just inside) */
      c2.strokeStyle = 'rgba(255,255,255,.06)'
      c2.lineWidth = 2.4
      c2.beginPath(); c2.arc(cx, cy, faceR + 15, 0, Math.PI * 2); c2.stroke()
      if (sim.dual) {
        c2.strokeStyle = 'rgba(255,255,255,.05)'
        c2.lineWidth = 2
        c2.beginPath(); c2.arc(cx, cy, faceR + 21, 0, Math.PI * 2); c2.stroke()
      }
      const lockRing = (val: number, rr: number, caughtIt: boolean, clV: number, warm: boolean) => {
        if (caughtIt) {
          c2.strokeStyle = warm ? 'rgba(232,180,76,.85)' : 'rgba(103,232,249,.85)'
          c2.lineWidth = 2.6
          c2.beginPath(); c2.arc(cx, cy, rr, 0, Math.PI * 2); c2.stroke()
          return
        }
        if (val <= 0) return
        c2.strokeStyle = warm ? lerpC(Math.max(clV, 0.6), 0.95) : `rgba(103,232,249,${0.55 + clV * 0.4})`
        c2.lineWidth = 3.2
        c2.beginPath(); c2.arc(cx, cy, rr, rad(-90), rad(-90 + val * 360)); c2.stroke()
        if (val > 0.55) { c2.shadowColor = warm ? lerpC(clV, 0.7) : 'rgba(103,232,249,.7)'; c2.shadowBlur = 9; c2.stroke(); c2.shadowBlur = 0 }
      }
      lockRing(sim.lock, faceR + 15, sim.dual && sim.caughtA, cl, true)
      if (sim.dual) lockRing(sim.lock2, faceR + 21, sim.caughtB, cl2, false)

      /* particles + burst rings */
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.t += 0.016
        p.r += p.spd * 0.016
        if (p.t > p.life) { parts.splice(i, 1); continue }
        const a = 1 - p.t / p.life
        c2.save()
        c2.translate(cx + Math.cos(p.a) * p.r, cy + Math.sin(p.a) * p.r)
        c2.rotate(p.a + t * 2)
        c2.fillStyle = p.warm ? `rgba(232,180,76,${a})` : `rgba(103,232,249,${a})`
        c2.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz)
        c2.restore()
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i]
        rg.t += 0.016
        for (let k = 0; k < 3; k++) {
          const tn = rg.t - k * 0.14
          if (tn <= 0 || tn >= 1.3) continue
          c2.strokeStyle = `rgba(103,232,249,${(1 - tn / 1.3) * 0.45})`
          c2.lineWidth = 2.4 - k * 0.6
          c2.beginPath(); c2.arc(cx, cy, faceR + 15 + tn * 90, 0, Math.PI * 2); c2.stroke()
        }
        if (rg.t > 1.8) rings.splice(i, 1)
      }

      /* seal blades — the aperture. Recede radially as the seal works open. */
      if (sim.openV < 1) {
        const oE = 1 - Math.pow(1 - sim.openV, 3)
        const alpha = 1 - sim.openV
        c2.fillStyle = `rgba(4,6,12,${0.62 * alpha})`
        c2.beginPath(); c2.arc(cx, cy, R, 0, Math.PI * 2); c2.fill()
        for (let i = 0; i < 8; i++) {
          const bis = rad(i * 45 + 22.5 + t * 3)
          const tipR = 4 + oE * (R + 40)
          const half = rad(25)
          const b1 = bis - half
          const b2 = bis + half
          const baseR = R + 16
          c2.fillStyle = `rgba(17,26,44,${0.97 * alpha})`
          c2.beginPath()
          c2.moveTo(cx + Math.cos(b1) * baseR, cy + Math.sin(b1) * baseR)
          c2.lineTo(cx + Math.cos(b2) * baseR, cy + Math.sin(b2) * baseR)
          c2.lineTo(cx + Math.cos(bis) * tipR, cy + Math.sin(bis) * tipR)
          c2.closePath()
          c2.fill()
          c2.strokeStyle = `rgba(232,180,76,${0.5 * alpha})`
          c2.lineWidth = 1.1
          c2.beginPath()
          c2.moveTo(cx + Math.cos(b1) * baseR, cy + Math.sin(b1) * baseR)
          c2.lineTo(cx + Math.cos(bis) * tipR, cy + Math.sin(bis) * tipR)
          c2.stroke()
          c2.strokeStyle = `rgba(232,180,76,${0.18 * alpha})`
          c2.beginPath()
          c2.moveTo(cx + Math.cos(b2) * baseR, cy + Math.sin(b2) * baseR)
          c2.lineTo(cx + Math.cos(bis) * tipR, cy + Math.sin(bis) * tipR)
          c2.stroke()
        }
        /* center hub — hides the blade-tip seam, gives the iris a machined core */
        const hubR = 17 + oE * 8
        c2.fillStyle = `rgba(17,26,44,${0.98 * alpha})`
        c2.beginPath(); c2.arc(cx, cy, hubR, 0, Math.PI * 2); c2.fill()
        c2.strokeStyle = `rgba(232,180,76,${0.4 * alpha})`
        c2.lineWidth = 1.2
        c2.beginPath(); c2.arc(cx, cy, hubR, 0, Math.PI * 2); c2.stroke()
        c2.beginPath()
        c2.moveTo(cx, cy)
        c2.lineTo(cx + Math.cos(rad(t * 3)) * (hubR - 4), cy + Math.sin(rad(t * 3)) * (hubR - 4))
        c2.stroke()
        /* seal progress arc */
        c2.strokeStyle = 'rgba(232,180,76,.85)'
        c2.lineWidth = 3
        c2.beginPath(); c2.arc(cx, cy, R - 33, rad(-90), rad(-90 + sim.seal * 360)); c2.stroke()
        c2.strokeStyle = 'rgba(232,180,76,.18)'
        c2.lineWidth = 1.2
        c2.beginPath(); c2.arc(cx, cy, R - 40, 0, Math.PI * 2); c2.stroke()
      }
    }

    const loop = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016)
      lastT = now
      /* WALL-CLOCK LAW: lock fill/drain is scoring — it answers
         to real seconds, not throttled rAF deltas. */
      const wallDt = Math.min(0.5, (now - lastWall) / 1000 || 0.016)
      lastWall = now

      if (sim.phase === 'tune') {
        if (sim.cipher) {
          /* the cipher wheel — snap to detents, hold the true shift */
          const k = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
          if (!sim.dragging) sim.rot += wrapDiff(k * DET, mod360(sim.rot)) * 0.18
          const dk0 = Math.abs(k - sim.cipherShift)
          const dk = Math.min(dk0, 26 - dk0)
          sim.tune01 = k / 26
          const clT = dk === 0 ? 1 : clamp(1 - dk / 7, 0, 0.7)
          sim.clarity += (clT - sim.clarity) * 0.2
          if (dk === 0) sim.lock = Math.min(1, sim.lock + wallDt / CIPHER_SECS)
          else sim.lock = Math.max(0, sim.lock - wallDt / (CIPHER_SECS * 0.7))
          if (sim.lock >= 1) finalizeRound()
        } else {
          const el = (now - sim.roundStart) / 1000
          if (!(sim.dual && sim.caughtA)) sim.effTarget = sim.target + (sim.drift ? Math.sin(el * 1.15) * sim.drift : 0)
          if (sim.dual && !sim.caughtB) sim.effTarget2 = sim.target2

          /* living frequency — each uncaught voice retunes on its own schedule */
          if (now > sim.hopAt && sim.hopEvery && !(sim.dual && sim.caughtA)) doHop(1, now)
          if (sim.dual && now > sim.hopAt2 && sim.hopEvery && !sim.caughtB) doHop(2, now)

          if (!sim.dragging && Math.max(sim.clarity, sim.clarity2) > 0.58) {
            // the signal grabs the needle — toward the nearest live voice
            let bestD = Infinity
            let pull = sim.effTarget
            if (!sim.dual || !sim.caughtA) {
              const d = wrapDiff(sim.effTarget, mod360(sim.rot))
              bestD = Math.abs(d)
              pull = sim.effTarget
            }
            if (sim.dual && !sim.caughtB) {
              const d = wrapDiff(sim.effTarget2, mod360(sim.rot))
              if (Math.abs(d) < bestD) pull = sim.effTarget2
            }
            sim.rot += wrapDiff(pull, mod360(sim.rot)) * 0.05
          }
          const pos = mod360(sim.rot)
          sim.tune01 = pos / 360
          const d1 = Math.abs(wrapDiff(sim.effTarget, pos))
          const deadA = now < sim.deadUntil
          const clT1 = sim.dual && sim.caughtA ? 0.35 : deadA ? 0 : Math.pow(clamp(1 - d1 / 60, 0, 1), 1.35)
          sim.clarity += (clT1 - sim.clarity) * 0.18
          const inA = sim.dual && sim.caughtA ? false : d1 <= sim.win
          if (sim.dual) {
            const d2 = Math.abs(wrapDiff(sim.effTarget2, pos))
            const clT2 = sim.caughtB ? 0.35 : now < sim.deadUntil2 ? 0 : Math.pow(clamp(1 - d2 / 60, 0, 1), 1.35)
            sim.clarity2 += (clT2 - sim.clarity2) * 0.18
            const inB = sim.caughtB ? false : d2 <= sim.win
            // WALL-CLOCK LAW for every lock
            if (inA) sim.lock = Math.min(1, sim.lock + wallDt / LOCK_SECS)
            else sim.lock = Math.max(0, sim.lock - wallDt / (LOCK_SECS * 0.55))
            if (inB) sim.lock2 = Math.min(1, sim.lock2 + wallDt / LOCK_SECS)
            else sim.lock2 = Math.max(0, sim.lock2 - wallDt / (LOCK_SECS * 0.55))
            if (!sim.caughtA && sim.lock >= 1) catchStation(1)
            else if (!sim.caughtB && sim.lock2 >= 1) catchStation(2)
          } else {
            if (inA) sim.lock = Math.min(1, sim.lock + wallDt / LOCK_SECS)
            else sim.lock = Math.max(0, sim.lock - wallDt / (LOCK_SECS * 0.55))
            if (sim.lock >= 1) finalizeRound()
          }
        }
        if (!sim.assisted && !sim.master && !sim.cipher && now - sim.roundStart > ASSIST_AT * 1000) {
          sim.assisted = true
          sim.win *= 1.55
          setAssistNote(true)
          chime(311, 1.6, 0.05)
        }
      } else if (sim.phase === 'catch' || sim.phase === 'verdict') {
        sim.clarity += (1 - sim.clarity) * 0.12
        if (sim.dual) sim.clarity2 += (1 - sim.clarity2) * 0.12
        if (sim.phase === 'verdict') sim.rot += dt * 3
        sim.lock = Math.max(0, sim.lock - wallDt * 2)
        sim.lock2 = Math.max(0, sim.lock2 - wallDt * 2)
      } else if (sim.phase === 'seal') {
        // seal display lags drags slightly — mechanical weight
        sim.openV += (sim.seal - sim.openV) * 0.3
        sim.clarity = 0
      }

      // scope audio — retry until the context truly runs
      if (!scope) scope = signalScope()
      scope?.set(sim.phase === 'verdict' ? 0.35 : sim.phase === 'seal' ? 0 : Math.max(sim.clarity, sim.clarity2), sim.tune01)

      draw(now)

      /* DOM readouts on a slow tick */
      if (++frame % 5 === 0) {
        if (readoutRef.current) {
          const pos = mod360(sim.rot)
          if (sim.phase === 'seal') {
            readoutRef.current.textContent = `SEAL ${(sim.seal * 100) | 0}% · TURN ${SEAL_ARC}°`
          } else if (sim.cipher) {
            const k = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
            readoutRef.current.textContent = `WHEEL SHIFT ${String(k).padStart(2, '0')}${k === sim.cipherShift ? ' · THE WORDS WAKE' : ''}`
          } else {
            const mode = sim.phase === 'tune' ? (sim.drift ? ' · DRIFT' : sim.hopEvery ? ' · LIVE FREQ' : '') : ''
            const duo = sim.dual ? ' · TWO VOICES' : ''
            const mst = sim.master ? ` · ×${sim.streak}` : ''
            readoutRef.current.textContent = `θ ${pos.toFixed(1)}° · CL ${(Math.max(sim.clarity, sim.clarity2) * 100) | 0}%${mode}${duo}${mst}`
          }
        }
        if (lockRef.current) {
          const c = Math.max(sim.clarity, sim.clarity2)
          const word =
            sim.phase === 'seal' ? '— THE SEAL HOLDS —'
            : sim.phase === 'catch' ? (sim.master ? `◈ STATION CLEANSED ×${sim.streak} ◈` : '◈ FRAGMENT CAUGHT ◈')
            : sim.phase === 'verdict' ? '◈ RESTORED ◈'
            : sim.cipher ? (sim.lock > 0.05 ? '◈ THE WORDS WAKE — HOLD ◈' : '· THE WORDS SLEEP ·')
            : Math.max(sim.lock, sim.lock2) > 0.05 ? '◈ HOLD THE LOCK ◈'
            : c > 0.78 ? '» CARRIER — HOLD STEADY «'
            : c > 0.5 ? '· SIGNAL FADING IN ·'
            : c > 0.22 ? '· STATIC FADING ·' : '— ONLY STATIC —'
          lockRef.current.textContent = word
          lockRef.current.style.color =
            Math.max(sim.lock, sim.lock2) > 0.05 || sim.phase === 'catch' || sim.phase === 'verdict' ? 'var(--kyber)'
            : c > 0.5 ? 'var(--ember)' : 'var(--ghost)'
        }
        /* cipher strip — decode attempt updates live as the wheel turns */
        if (sim.cipher && cipherRef.current && decodeRef.current) {
          const k = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
          const enc = shiftTxt(CIPHER_PLAIN, sim.cipherShift)
          const dec = shiftTxt(enc, -k)
          cipherRef.current.textContent = enc.split('').join(' ')
          decodeRef.current.textContent = dec.split('').join(' ')
          decodeRef.current.style.color = k === sim.cipherShift ? 'var(--kyber)' : 'var(--ghost)'
          decodeRef.current.style.textShadow = k === sim.cipherShift ? '0 0 14px rgba(103,232,249,.8)' : 'none'
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    /* master band bridge — the verdict button reaches into the sim */
    masterStartRef.current = () => {
      sim.master = true
      sim.streak = 0
      sim.mScore = 0
      sim.depth = 0
      setVerdict(null)
      setCaught([])
      setMHud({ streak: 0, score: 0, best: sim.mBest })
      setFlash('THE MASTER BAND OPENS — HOLD EVERY STATION. NOTHING WAITS FOR YOU.')
      later(4600, () => setFlash(null))
      chime(349.23, 1.6, 0.08)
      later(160, () => chime(523.25, 1.8, 0.07))
      beginMasterStation()
    }

    /* console-state read-out */
    ;(window as unknown as { __tsg?: unknown }).__tsg = {
      rot: () => sim.rot,
      pos: () => mod360(sim.rot),
      target: () => sim.effTarget,
      targets: () => [sim.effTarget, sim.effTarget2] as const,
      locks: () => [sim.lock, sim.lock2] as const,
      caughtSt: () => [sim.caughtA, sim.caughtB] as const,
      dual: () => sim.dual,
      cipher: () => {
        const k = ((Math.round(mod360(sim.rot) / DET) % 26) + 26) % 26
        return { on: sim.cipher, k, shift: sim.cipherShift, det: DET }
      },
      master: () => ({ on: sim.master, streak: sim.streak, score: sim.mScore, depth: sim.depth }),
      phase: () => sim.phase,
      lock: () => sim.lock,
      win: () => sim.win,
      seal: () => sim.seal,
      caught: () => sim.caughtN,
      score: () => sim.qualities,
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      timers.forEach((id) => clearTimeout(id))
      sealDrag.kill()
      tuneDrag?.kill()
      scatter?.kill()
      gsap.killTweensOf(sim)
      scope?.stop()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', fitCanvas)
      masterStartRef.current = null
      delete (window as unknown as { __tsg?: unknown }).__tsg
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* verdict panel entrance — only after React commits the node */
  useEffect(() => {
    if (phase !== 'verdict') return
    gsap.fromTo('.tsg-verdict-panel', { autoAlpha: 0, scale: 0.94, y: 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: 'expo.out', delay: 0.2 })
  }, [phase])

  /* the moment the verdict lands, the rite is earned — persist immediately
     so the master band can open without routing through the claim button */
  useEffect(() => {
    if (phase !== 'verdict' || !verdict) return
    const st = useSanctum.getState()
    st.completeTrial('signal')
    st.setTrialScore('signal', verdict.score)
    st.setFragsCaught(5)
    questEvent({ type: 'rite-clear', id: 'signal', score: verdict.score })
  }, [phase, verdict])

  const MASTER_STATIONS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  const roundLabel =
    phase === 'seal' ? 'THE SEALED DIAL'
    : phase === 'verdict' ? 'RITE COMPLETE'
    : mHud ? `THE MASTER BAND — STATION ${MASTER_STATIONS[Math.min(MASTER_STATIONS.length - 1, Math.max(0, sim.depth - 1))]} · STREAK ×${mHud.streak}`
    : `FRAGMENT ${ROMAN[round]} OF V ${ROUNDS[round].tag}`

  return (
    <div
      ref={root}
      data-tsg-phase={phase}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(4,6,12,.97)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}
    >
      <div
        className="tsg-in"
        style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 14px', gap: 10 }}
      >
        {/* master band HUD */}
        {mHud && phase !== 'verdict' && (
          <div
            data-tsg-mhud
            className="t-mono"
            style={{ position: 'absolute', top: 66, left: 26, zIndex: 7, fontSize: 9.5, letterSpacing: '.26em', color: 'var(--ember)' }}
          >
            MASTER BAND — STREAK ×{mHud.streak} · SCORE {mHud.score} · BEST ×{mHud.best}
          </div>
        )}
        {phase !== 'verdict' && (
          <button
            onClick={mHud ? () => { questEvent({ type: 'master' }); onExit() } : onExit}
            data-tsg-exit
            data-cursor="RETURN"
            className="tsg-abandon t-mono"
            style={{ position: 'absolute', top: 22, right: 26, zIndex: 7, padding: '9px 16px', background: 'transparent', border: '1px solid rgba(103,232,249,.22)', color: 'var(--ghost)', fontSize: 9, letterSpacing: '.3em', cursor: 'none', borderRadius: 3, transition: 'all .3s' }}
          >
            {mHud ? 'SEAL THE RUN ✕' : 'ABANDON RITE ✕'}
          </button>
        )}

        <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.4em', color: 'var(--ember)' }}>
          RITE I — THE TRIAL OF SIGNAL
        </p>
        <h2 className="t-display gt-steel" style={{ fontSize: 'clamp(22px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '.1em', lineHeight: 1.05, minHeight: '1.1em' }}>
          <Scramble key={phase} text={PHASE_TITLE[phase]} charMs={36} scrambleMs={300} />
        </h2>
        <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.3em', color: 'var(--kyber-dim)', minHeight: '1.2em' }}>
          {roundLabel}
        </p>

        {/* ── THE DIAL ── */}
        <div
          ref={faceRef}
          data-tsg-face
          data-cursor={phase === 'seal' ? 'GRAB · TURN' : sim.cipher ? 'DECRYPT' : 'TUNE'}
          style={{ position: 'relative', width: 'min(78vw, 44vh, 470px)', aspectRatio: '1', cursor: 'grab', touchAction: 'none', userSelect: 'none', flex: 'none' }}
        >
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
          <div ref={proxyRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 4, height: 4, pointerEvents: 'none' }} />
        </div>

        {/* readouts */}
        <div className="t-mono" style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 9.5, letterSpacing: '.22em', color: 'var(--ghost)', minHeight: '1.4em' }}>
          <span ref={readoutRef}>—</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span ref={lockRef} style={{ transition: 'color .4s' }}>— THE SEAL HOLDS —</span>
        </div>

        {/* cipher strip — dead cipher above, waking decode below */}
        {sim.cipher && phase === 'tune' && (
          <div data-tsg-cipher style={{ display: 'grid', placeItems: 'center', gap: 3, minHeight: 42 }}>
            <p ref={cipherRef} className="t-mono" style={{ fontSize: 12, letterSpacing: '.4em', color: 'var(--ember)', opacity: 0.75 }} />
            <p ref={decodeRef} className="t-mono" style={{ fontSize: 13, letterSpacing: '.4em', color: 'var(--ghost)', transition: 'color .3s, text-shadow .3s' }} />
          </div>
        )}

        {/* fragment line + notes */}
        <div style={{ minHeight: 24, display: 'grid', placeItems: 'center' }}>
          {phase === 'catch' && caught.length > 0 && (
            <p className="t-mono t-kyber" style={{ fontSize: 11.5, letterSpacing: '.18em', textAlign: 'center', paddingInline: 16 }}>
              <Scramble key={caught[caught.length - 1]} text={caught[caught.length - 1]} charMs={26} scrambleMs={380} />
            </p>
          )}
          {phase === 'tune' && flash && (
            <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.26em', color: 'var(--ember)', textAlign: 'center', paddingInline: 18, maxWidth: 560 }}>
              {flash}
            </p>
          )}
          {phase === 'tune' && !flash && slipNote && (
            <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.26em', color: 'var(--ember)', animation: 'caretBlink .7s steps(1) infinite' }}>
              ↻ THE SIGNAL SLIPPED — RETUNE
            </p>
          )}
          {phase === 'tune' && !flash && !slipNote && assistNote && (
            <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.26em', color: 'var(--ember)' }}>
              THE ARCHIVIST WIDENS THE WINDOW
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {FRAGMENTS.map((f, i) => (
            <span key={f} className={`tsg-chip ${(mHud ? mHud.streak > i : caught.length > i) ? 'is-lit' : ''}`}>
              <i />{mHud ? `×${i + 1}` : `FRAGMENT ${ROMAN[i]}`}
            </span>
          ))}
        </div>

        <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.85 }}>
          {phase === 'seal' ? (
            <><span style={{ color: 'var(--ember)' }}>HOLD · TURN THE SEAL</span> — the aperture yields</>
          ) : sim.cipher ? (
            <><span style={{ color: 'var(--ember)' }}>TURN THE WHEEL</span> — every glyph is a shift · hold when the words wake</>
          ) : (
            <><span style={{ color: 'var(--ember)' }}>TURN THE DIAL</span> — hold when the carrier sings · <span className="tsg-key">←</span> <span className="tsg-key">→</span> nudge · <span className="tsg-key">SHIFT</span> fine</>
          )}
        </p>

        {/* ── VERDICT ── */}
        {phase === 'verdict' && verdict && (
          <div className="tsg-verdict">
            <div className="tsg-verdict-panel" style={{ opacity: 0 }}>
              <p className="t-mono t-kyber" style={{ fontSize: 10, letterSpacing: '.4em' }}>◈ THE ARCHIVIST'S TRANSMISSION ◈</p>
              <div style={{ margin: '18px 0 4px' }}>
                {caught.map((f, i) => (
                  <p key={f} className="tsg-frag-line"><b>{ROMAN[i]}.</b> {f}</p>
                ))}
              </div>
              <div style={{ margin: '22px auto 0', height: 1, maxWidth: 300, background: 'linear-gradient(90deg, transparent, rgba(103,232,249,.4), transparent)' }} />
              <h3 className="t-display" style={{ marginTop: 18, fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 900, letterSpacing: '.1em', color: 'var(--bone)' }}>
                TRANSMISSION RESTORED
              </h3>
              <p className="t-mono" style={{ marginTop: 10, fontSize: 10, letterSpacing: '.3em', color: 'var(--ember)' }} data-tsg-score={verdict.score}>
                SIGNAL ACUITY {verdict.acuity}% — RANK ECHO +{verdict.score}
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { chime(660, 1, 0.08); onComplete(verdict.score) }}
                  data-tsg-claim
                  data-cursor="FORGE"
                  onMouseEnter={() => blip(true)}
                  style={{ marginTop: 24, padding: '13px 34px', background: 'rgba(103,232,249,.08)', border: '1px solid rgba(103,232,249,.5)', color: 'var(--kyber)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', cursor: 'none', borderRadius: 4, transition: 'all .3s' }}
                >
                  RETURN TO THE ORBIT ◈
                </button>
                <button
                  onClick={() => { chime(440, 1, 0.08); masterStartRef.current?.() }}
                  data-tsg-master
                  data-cursor="ASCEND"
                  onMouseEnter={() => blip(true)}
                  style={{ marginTop: 24, padding: '13px 34px', background: 'rgba(232,180,76,.07)', border: '1px solid rgba(232,180,76,.55)', color: 'var(--ember)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', cursor: 'none', borderRadius: 4, transition: 'all .3s' }}
                >
                  RUN THE MASTER BAND
                </button>
              </div>
              <p className="t-mono" style={{ marginTop: 14, fontSize: 8.5, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.8 }}>
                THE MASTER BAND: endless stations, the streak multiplies — the log remembers your best
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
