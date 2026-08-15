import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Scramble from './Scramble'
import ProofRun, { PROOF_OF, type ProofMode } from './ProofRun'
import { useSanctum } from '../store'
import { questEvent } from '../game/quests'
import { blip, chime, impact, thud } from './audio'

/* ── TRIAL OF CHOICE ──────────────────────────────────────────────
   The Archivist watches. Three dilemmas, no wrong answers — only true
   ones. Each path pulls a hidden conviction pole (act / weigh); the
   chamber measures CONSISTENCY + deliberation, not correctness.
   Hover tilts holo-cards with a pointer-tracked sheen; choosing flies
   the loser away and slams JUDGMENT RECORDED like a wax seal.       */

export const DILEMMAS = [
  {
    n: 'I', art: '/art/d1.jpg', title: 'THE DROWNING TRANSMISSION',
    scene: 'A distress call crackles from beyond the border moons. Armed ships are closer — but the beacon is coded to your name.',
    a: { head: 'ANSWER ALONE', sub: 'Go now. Carry only yourself.' },
    b: { head: 'RELAY THE FLEET', sub: 'Get there in force — slower, surer.' },
  },
  {
    n: 'II', art: '/art/d2.jpg', title: 'THE SMUGGLER AT THE GATE',
    scene: 'A courier with Empire brands on their hull begs sanctuary. Their hold weeps with refugees — or so they say.',
    a: { head: 'OPEN THE GATE', sub: 'Sanctuary is not a reward. It is a promise.' },
    b: { head: 'SCAN THEM FIRST', sub: 'Mercy survives because someone verifies.' },
  },
  {
    n: 'III', art: '/art/d3.jpg', title: 'THE TRUTH THAT BURNS',
    scene: "You hold proof that a beloved councilor sold routes to the Empire — her children at knife-point when she signed. Publishing restores the network's trust. Burning it keeps her.",
    a: { head: 'LET IT BE KNOWN', sub: 'A network built on quiet lies is already breached.' },
    b: { head: 'LET IT REST', sub: 'Judge the knife, not the hand that bled.' },
  },
]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
type Phase = 'intro' | 'decide' | 'stamp' | 'proof' | 'verdict'
type Props = { onExit: () => void; onComplete: (score: number) => void }
const COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const PHASE_TITLE: Record<Phase, string> = {
  intro: 'THE ARCHIVIST WATCHES',
  decide: 'THE GALAXY SPLITS',
  stamp: 'RECORDED',
  proof: 'PROVE THE PATH',
  verdict: 'THE PATH REMEMBERS',
}

export default function TrialChoice({ onExit, onComplete }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [di, setDi] = useState(0)
  const [hover, setHover] = useState<'' | 'a' | 'b'>('')
  const [armedTap, setArmedTap] = useState<'' | 'a' | 'b'>('')
  const [stampTxt, setStampTxt] = useState('')
  const [proofMode, setProofMode] = useState<ProofMode | null>(null)
  const [verdict, setVerdict] = useState<{ score: number; pole: number; conv: number; lean: ('a' | 'b')[]; deeds: number } | null>(null)

  const sim = useRef({ leans: [] as ('a' | 'b')[], times: [] as number[], shownAt: 0, phase: 'intro' as Phase, proofs: [] as number[] }).current
  const walkPath = useSanctum((s) => s.walkPath)
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }

  /* mount entrance + intro auto-advance */
  useEffect(() => {
    gsap.fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' })
    gsap.fromTo('.tch-in > *', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'power2.out', delay: 0.15 })
    later(2300, () => beginDilemma(0))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sim.phase !== 'verdict') onExit()
    }
    window.addEventListener('keydown', onKey)
    const timersRef = timers.current
    return () => {
      timersRef.forEach((id) => clearTimeout(id))
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function beginDilemma(i: number) {
    sim.phase = 'decide'
    sim.shownAt = performance.now()
    setArmedTap('')
    setHover('')
    setDi(i)
    setPhase('decide')
  }

  /* state-driven dilemma entrances — the commit-race law */
  useEffect(() => {
    if (phase !== 'decide') return
    gsap.fromTo('.tch-dil', { autoAlpha: 0, y: 26, rotateX: -8 }, { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' })
    gsap.fromTo('.tch-path', { autoAlpha: 0, y: 34 }, {
      autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.1, ease: 'power3.out', delay: 0.16,
      onComplete() { gsap.set('.tch-path', { clearProps: 'transform' }) },
    })
  }, [phase, di])

  /* stamp entrance — state-driven */
  useEffect(() => {
    if (phase !== 'stamp') return
    gsap.fromTo('.tch-stamp', { autoAlpha: 0, scale: 2.9, rotate: -24 }, { autoAlpha: 1, scale: 1, rotate: -10, duration: 0.3, ease: 'power4.in' })
    gsap.fromTo('.tch-flash', { opacity: 0.4 }, { opacity: 0, duration: 0.5, ease: 'power2.out' })
    later(300, () => {
      impact(0.2)
      chime(466.16, 0.9, 0.05)
      gsap.fromTo('.tch-dil', { x: 0, y: 0 }, { x: 3, y: -2, duration: 0.06, repeat: 3, yoyo: true, clearProps: 'x,y' })
    })
  }, [phase])

  /* verdict entrance — state-driven */
  useEffect(() => {
    if (phase !== 'verdict') return
    gsap.fromTo('.tch-verdict-panel', { autoAlpha: 0, scale: 0.94, y: 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: 'expo.out', delay: 0.2 })
  }, [phase])

  /** pointer-tracked holo tilt + sheen (no blend modes — the ghost law) */
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${nx * 13}deg) rotateX(${-ny * 10}deg) translateZ(6px)`
    const sheen = el.querySelector<HTMLElement>('.tch-sheen')
    if (sheen) sheen.style.transform = `translateX(${nx * 130}%)`
  }
  const untilt = (e: React.PointerEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, { rotateX: 0, rotateY: 0, z: 0, duration: 0.6, ease: 'elastic.out(1, .6)', clearProps: 'transform' })
  }

  function choose(side: 'a' | 'b') {
    if (sim.phase !== 'decide') return
    if (COARSE && armedTap !== side) {
      setArmedTap(side)
      blip(true)
      return // touch: first tap arms, second commits
    }
    sim.times.push((performance.now() - sim.shownAt) / 1000)
    sim.leans.push(side)
    walkPath(`${di}${side}`) // the log remembers every path ever walked
    sim.phase = 'stamp'
    thud(0.16)
    questEvent({ type: 'paths' })
    setStampTxt(DILEMMAS[di][side].head)
    /* the loser falls away; the winner rises and dissolves */
    gsap.to(`.tch-path-${side === 'a' ? 'b' : 'a'}`, { autoAlpha: 0, y: 70, rotateZ: side === 'a' ? 4 : -4, duration: 0.55, ease: 'power2.in' })
    gsap.to(`.tch-path-${side}`, { autoAlpha: 0, y: -46, scale: 1.06, duration: 0.6, ease: 'power3.in' })
    setPhase('stamp')
    later(1500, () => {
      /* EVERY JUDGMENT DEMANDS ITS PROOF (the decree) */
      const pm = PROOF_OF[`${di}${side}`]
      if (pm) {
        sim.phase = 'proof'
        setProofMode(pm)
        setPhase('proof')
        chime(392, 1, 0.06)
      } else {
        advance()
      }
    })
  }

  function advance() {
    setProofMode(null)
    if (sim.leans.length >= 3) showVerdict()
    else beginDilemma(di + 1)
  }

  function proofDone(q: number) {
    sim.proofs.push(q)
    advance()
  }

  function showVerdict() {
    sim.phase = 'verdict'
    const pole = sim.leans.reduce((s, l) => s + (l === 'a' ? 1 : -1), 0)
    const avgT = sim.times.reduce((s, t) => s + t, 0) / sim.times.length
    const swift = clamp(1.2 - avgT / 30, 0, 1)
    const q = 0.6 * (Math.abs(pole) / 3) + 0.4 * swift
    const deeds = sim.proofs.length ? Math.round(sim.proofs.reduce((s, p) => s + p, 0) / sim.proofs.length * 100) : 0
    /* conviction stays primary; proven deeds are the bonus layer */
    const proofAvg = sim.proofs.length ? sim.proofs.reduce((s, p) => s + p, 0) / sim.proofs.length : 0.5
    const score = clamp(Math.round(q * 3 * 0.75 + proofAvg * 3 * 0.25), 0, 3)
    const conv = Math.round((Math.abs(pole) / 3) * 60 + swift * 40)
    setVerdict({ score, pole, conv, lean: [...sim.leans], deeds })
    setPhase('verdict')
    questEvent({ type: 'pole', pole }) // one-straight-line quest listens
    chime(261.63, 2.4, 0.08)
    later(150, () => chime(329.63, 2.4, 0.07))
    later(300, () => chime(523.25, 2.8, 0.06))
    impact(0.12)
  }

  const d = DILEMMAS[di]
  const flavor = verdict
    ? Math.abs(verdict.pole) === 3
      ? verdict.pole > 0 ? 'THE OPEN PATH — you act while others weigh' : 'THE QUIET PATH — you weigh what others rush'
      : 'THE MEASURED PATH — you cut between'
    : ''

  return (
    <div ref={root} data-tch-phase={phase} data-tch-dilemma={di}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(4,6,12,.97)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
      <div className="tch-in" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 20px', gap: 10 }}>
        {phase !== 'verdict' && (
          <button onClick={onExit} data-cursor="RETURN" className="tsg-abandon t-mono"
            style={{ position: 'absolute', top: 22, right: 26, zIndex: 7, padding: '9px 16px', background: 'transparent', border: '1px solid rgba(103,232,249,.22)', color: 'var(--ghost)', fontSize: 9, letterSpacing: '.3em', cursor: 'none', borderRadius: 3, transition: 'all .3s' }}>
            ABANDON RITE ✕
          </button>
        )}

        <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.4em', color: 'var(--ember)' }}>RITE III — THE TRIAL OF CHOICE</p>
        <h2 className="t-display gt-steel" style={{ fontSize: 'clamp(22px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '.1em', lineHeight: 1.05, minHeight: '1.1em' }}>
          <Scramble key={phase} text={PHASE_TITLE[phase]} charMs={36} scrambleMs={300} />
        </h2>
        <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.3em', color: 'var(--kyber-dim)', minHeight: '1.2em' }}>
          {phase === 'intro' && 'THREE QUESTIONS. NO WRONG ANSWERS — ONLY TRUE ONES.'}
          {phase === 'decide' && `DILEMMA ${d.n} OF III — ${d.title}`}
          {phase === 'stamp' && 'THE CHAMBER KEEPS YOUR ANSWER'}
          {phase === 'verdict' && 'WHAT YOUR CHOICES AGREE ON'}
        </p>

        {/* progress glyphs */}
        <div style={{ display: 'flex', gap: 7 }}>
          {DILEMMAS.map((dd, i) => (
            <span key={dd.n} style={{
              width: 8, height: 8, transform: 'rotate(45deg)', border: '1px solid rgba(103,232,249,.4)',
              background: sim.leans.length > i ? 'var(--kyber)' : 'transparent',
              boxShadow: sim.leans.length > i ? '0 0 8px var(--kyber)' : 'none', transition: 'all .5s',
            }} />
          ))}
        </div>

        {/* ── THE PROOF CHAMBER (every verdict triggers its game) ── */}
        {phase === 'proof' && proofMode && <ProofRun mode={proofMode} onDone={proofDone} />}

        {/* ── THE DILEMMA CARD ── */}
        {phase !== 'intro' && phase !== 'verdict' && phase !== 'proof' && (
          <div className="tch-dil" style={{
            position: 'relative', width: 'min(92vw, 760px)', height: 'clamp(200px, 32vh, 290px)',
            borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(103,232,249,.22)',
            transformStyle: 'preserve-3d', boxShadow: '0 30px 80px rgba(0,0,0,.55)',
          }}>
            <img src={d.art} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 38%' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,6,12,.28) 0%, rgba(4,6,12,.55) 46%, rgba(4,6,12,.94) 100%)' }} />
            <div style={{ position: 'absolute', top: 16, left: 20 }} className="t-mono">
              <span style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ember)' }}>DILEMMA {d.n}</span>
            </div>
            <div className="t-display" style={{ position: 'absolute', top: 10, right: 20, fontSize: 44, fontWeight: 900, color: 'rgba(232,228,220,.16)' }}>{d.n}</div>
            <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--bone)', fontWeight: 300, maxWidth: 640, textShadow: '0 2px 14px rgba(0,0,0,.7)' }}>
                <Scramble key={`${di}-scene`} text={d.scene} charMs={9} scrambleMs={260} />
              </p>
            </div>
            {/* the flash ring on stamp */}
            {phase === 'stamp' && <div className="tch-flash" style={{ position: 'absolute', inset: 0, background: 'rgba(103,232,249,.16)', opacity: 0, pointerEvents: 'none' }} />}
            {/* ══ THE STAMP ══ */}
            {phase === 'stamp' && (
              <div className="tch-stamp" data-tch-stamp style={{
                position: 'absolute', left: '50%', top: '44%', translate: '-50% -50%', rotate: '-10deg',
                padding: '13px 30px', border: '2px solid rgba(232,180,76,.92)', borderRadius: 6,
                boxShadow: 'inset 0 0 0 2px rgba(232,180,76,.28), 0 10px 40px rgba(0,0,0,.5)',
                background: 'rgba(6,9,16,.68)', textAlign: 'center', pointerEvents: 'none',
              }}>
                <p className="t-mono" style={{ fontSize: 13, letterSpacing: '.34em', color: 'var(--ember)', fontWeight: 700 }}>JUDGMENT RECORDED</p>
                <p className="t-mono" style={{ marginTop: 6, fontSize: 8.5, letterSpacing: '.26em', color: 'rgba(232,228,220,.75)' }}>{d.n} — {stampTxt}</p>
              </div>
            )}
          </div>
        )}

        {/* ── THE TWO PATHS ── */}
        {phase === 'decide' && (
          <div style={{ display: 'flex', gap: 14, width: 'min(92vw, 760px)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {(['a', 'b'] as const).map((side) => {
              const p = d[side]
              const dimmed = (hover && hover !== side) || (armedTap && armedTap !== side)
              const armed = COARSE && armedTap === side
              return (
                <div
                  key={side}
                  className={`tch-path tch-path-${side}`}
                  data-tch-path={side}
                  data-cursor={armed ? 'COMMIT' : 'CHOOSE'}
                  onClick={() => choose(side)}
                  onPointerMove={tilt}
                  onPointerLeave={(e) => { untilt(e); setHover('') }}
                  onPointerEnter={() => { setHover(side); blip(side === 'a') }}
                  style={{
                    position: 'relative', flex: '1 1 280px', maxWidth: 370, minHeight: 118, padding: '20px 22px 16px',
                    borderRadius: 8, cursor: 'none', userSelect: 'none', overflow: 'hidden',
                    background: 'linear-gradient(180deg, rgba(12,19,34,.94), rgba(6,9,16,.96))',
                    border: `1px solid ${armed ? 'var(--ember)' : hover === side ? 'rgba(103,232,249,.6)' : 'rgba(103,232,249,.18)'}`,
                    opacity: dimmed ? 0.5 : 1,
                    transition: 'opacity .3s, border-color .3s',
                    boxShadow: hover === side ? '0 16px 50px rgba(103,232,249,.13)' : 'none',
                  }}
                >
                  {/* sheen — normal alpha only */}
                  <div className="tch-sheen" style={{ position: 'absolute', top: 0, bottom: 0, left: '-30%', width: '45%', background: 'linear-gradient(100deg, transparent, rgba(210,245,255,.08) 50%, transparent)', transform: 'translateX(0%)', transition: 'transform .15s linear', pointerEvents: 'none' }} />
                  <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.3em', color: side === 'a' ? 'var(--ember)' : 'var(--kyber-dim)' }}>PATH {side === 'a' ? 'Ἀ' : 'Ω'}</p>
                  <h4 className="t-display" style={{ marginTop: 8, fontSize: 16, letterSpacing: '.1em', fontWeight: 800, color: 'var(--bone)' }}>{p.head}</h4>
                  <p style={{ marginTop: 7, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ghost)', fontWeight: 300 }}>{p.sub}</p>
                  {armed && <p className="t-mono" style={{ marginTop: 10, fontSize: 8.5, letterSpacing: '.26em', color: 'var(--ember)', animation: 'caretBlink .8s steps(1) infinite' }}>» TAP AGAIN TO COMMIT</p>}
                </div>
              )
            })}
          </div>
        )}

        <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.85 }}>
          <span style={{ color: 'var(--ember)' }}>ANSWER AS YOURSELF</span> — the chamber measures conviction, not correctness
        </p>

        {/* ── VERDICT ── */}
        {phase === 'verdict' && verdict && (
          <div className="tsg-verdict">
            <div className="tsg-verdict-panel tch-verdict-panel" style={{ opacity: 0 }}>
              <p className="t-mono t-kyber" style={{ fontSize: 10, letterSpacing: '.4em' }}>◈ YOUR THREE JUDGMENTS ◈</p>
              <div style={{ margin: '16px 0 2px' }}>
                {DILEMMAS.map((dd, i) => (
                  <p key={dd.n} className="tsg-frag-line"><b>{dd.n}.</b> {dd.title} — <span style={{ color: 'var(--ember)' }}>{dd[verdict.lean[i]].head}</span></p>
                ))}
              </div>
              <div style={{ margin: '20px auto 0', height: 1, maxWidth: 300, background: 'linear-gradient(90deg, transparent, rgba(103,232,249,.4), transparent)' }} />
              <h3 className="t-display" style={{ marginTop: 16, fontSize: 'clamp(15px, 2vw, 21px)', fontWeight: 700, letterSpacing: '.08em', color: 'var(--bone)', maxWidth: 460, marginInline: 'auto', lineHeight: 1.4 }}>
                {flavor}
              </h3>
              <p className="t-mono" style={{ marginTop: 14, fontSize: 10, letterSpacing: '.3em', color: 'var(--ember)' }} data-tch-score={verdict.score}>
                CONVICTION {verdict.conv}%{verdict.deeds ? ` · DEEDS PROVEN ${verdict.deeds}%` : ''} — RANK ECHO +{verdict.score}
              </p>
              <button
                onClick={() => { chime(660, 1, 0.08); onComplete(verdict.score) }}
                data-tch-claim data-cursor="FORGE"
                onMouseEnter={() => blip(true)}
                style={{ marginTop: 24, padding: '13px 38px', background: 'rgba(103,232,249,.08)', border: '1px solid rgba(103,232,249,.5)', color: 'var(--kyber)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em', cursor: 'none', borderRadius: 4, transition: 'all .3s' }}>
                RETURN TO THE ORBIT ◈
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
