import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { Draggable, InertiaPlugin } from 'gsap/all'
import SplitType from 'split-type'
import { Starfield } from '../components/fx'
import TrialSignal from '../components/TrialSignal'
import TrialFocus from '../components/TrialFocus'
import TrialChoice from '../components/TrialChoice'
import { useSanctum } from '../store'
import { questEvent } from '../game/quests'
import { armOnFirstGesture, chime, blip, staticBurst, riser } from '../components/audio'

gsap.registerPlugin(Draggable, InertiaPlugin)

const ROT_PER = 120
export const RITE_INFO = [
  { n: 'I', id: 'signal', name: 'THE TRIAL OF SIGNAL', desc: 'Hear what hides beneath the static.' },
  { n: 'II', id: 'focus', name: 'THE TRIAL OF FOCUS', desc: 'Hold the beacon while the void pulls.' },
  { n: 'III', id: 'choice', name: 'THE TRIAL OF CHOICE', desc: 'The galaxy splits. You decide where.' },
]

/**
 * THE RITE ORBIT — an infinite 3D triangular carousel (P2 signature wow).
 * Drag-yank and the rites throw with real inertia; scroll-wheel steps them;
 * the front rite is your choice. GSAP Draggable + InertiaPlugin.
 */
export default function Trials() {
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const [armed, setArmed] = useState<number | null>(null) // which rite chambers, null = orbit
  const activeRef = useRef(0)
  activeRef.current = active
  const armedRef = useRef<number | null>(null) // armed truth readable inside the orbit effect (wheel guard)
  armedRef.current = armed
  const spinRef = useRef<(i: number) => void>(() => undefined)
  const renderRef = useRef<() => void>(() => undefined)

  const nav = useNavigate()
  const trialsDone = useSanctum((s) => s.trialsDone)
  const riteScores = useSanctum((s) => s.riteScores)
  const callsign = useSanctum((s) => s.callsign)
  const questsDone = useSanctum((s) => s.questsDone)
  const completeTrial = useSanctum((s) => s.completeTrial)
  const setTrialScore = useSanctum((s) => s.setTrialScore)
  const setFragsCaught = useSanctum((s) => s.setFragsCaught)

  const RITES = RITE_INFO.map((r, i) => ({
    ...r,
    open: i === 0 ? true : trialsDone.includes(RITE_INFO[i - 1].id),
    cleared: trialsDone.includes(r.id),
    score: (riteScores ?? {})[r.id] as number | undefined,
  }))

  useEffect(() => {
    armOnFirstGesture(() => undefined) // direct /trials entry must not be silent

    const rot = { a: 0 }
    let RX = Math.min(window.innerWidth * 0.3, 330)
    let tickMark = 0
    let dragDelta = 0

    const render = () => {
      cards.current.forEach((el, i) => {
        if (!el) return
        const ang = ((rot.a + i * ROT_PER) * Math.PI) / 180
        const z = Math.cos(ang) // 1 front, -1 back
        const depth = (z + 1) / 2
        const x = Math.sin(ang) * RX
        el.style.transform = `translate(-50%,-50%) translateX(${x}px) rotateY(${-Math.sin(ang) * 24}deg) scale(${0.68 + 0.32 * depth})`
        el.style.zIndex = String(Math.round(100 + z * 100))
        el.style.opacity = String(0.22 + 0.78 * depth)
        el.style.filter = `brightness(${0.5 + 0.5 * depth}) blur(${(1 - depth) * 2.4}px)`
        el.dataset.front = depth > 0.84 ? '1' : '0'
      })
      // mechanical tick as each 120° gate passes
      const mark = Math.round(rot.a / ROT_PER)
      if (mark !== tickMark) {
        tickMark = mark
        blip(mark % 2 === 0)
      }
    }
    renderRef.current = render

    const announceFront = () => {
      const idx = ((Math.round(-rot.a / ROT_PER) % 3) + 3) % 3
      if (idx !== activeRef.current) {
        setActive(idx)
        chime(392 + idx * 78, 0.7, 0.05)
      }
    }

    /** orbit the chosen rite to the front by the shortest path */
    const spinTo = (i: number) => {
      const base = -i * ROT_PER
      const target = base + Math.round((rot.a - base) / 360) * 360
      gsap.killTweensOf(rot)
      gsap.to(rot, { a: target, duration: 0.55, ease: 'power3.out', onUpdate: render, onComplete: announceFront })
    }
    spinRef.current = spinTo

    const snap = () => {
      const target = Math.round(rot.a / ROT_PER) * ROT_PER
      gsap.to(rot, {
        a: target, duration: 0.6, ease: 'back.out(1.7)',
        onUpdate: render, onComplete: announceFront,
      })
    }

    const proxy = document.createElement('div')
    let startRot = 0
    const drag = Draggable.create(proxy, {
      type: 'x',
      inertia: true,
      trigger: stage.current,
      minimumMovement: 4,
      onPress() {
        startRot = rot.a
        dragDelta = 0
        gsap.killTweensOf(rot)
        stage.current?.classList.add('is-drag')
      },
      onDrag() {
        dragDelta = Math.max(dragDelta, Math.abs(this.x))
        rot.a = startRot - this.x * 0.6
        render()
      },
      onThrowUpdate() {
        rot.a = startRot - this.x * 0.6
        render()
      },
      onThrowComplete: snap,
      onDragEnd() {
        if (!this.isThrowing) snap()
        stage.current?.classList.remove('is-drag')
        gsap.set(proxy, { x: 0 })
      },
    })[0]

    // scroll-wheel over the orbit steps the carousel
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (armedRef.current !== null) return
      e.preventDefault()
      acc += e.deltaY
      if (Math.abs(acc) < 60) return
      const dir = acc > 0 ? -1 : 1
      acc = 0
      const target = (Math.round(rot.a / ROT_PER) + dir) * ROT_PER
      staticBurst(0.12, 0.03)
      gsap.to(rot, { a: target, duration: 0.55, ease: 'power3.out', onUpdate: render, onComplete: announceFront })
    }
    stage.current?.addEventListener('wheel', onWheel, { passive: false })

    const onResize = () => { RX = Math.min(window.innerWidth * 0.3, 330); render() }
    window.addEventListener('resize', onResize)

    render()

    // entrances
    const ctx = gsap.context(() => {
      const titleChars = new SplitType('.ts-title', { types: 'words,chars' }).chars
      gsap.fromTo(titleChars,
        { opacity: 0, yPercent: 60, filter: 'blur(6px)' },
        { opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.045, ease: 'expo.out', delay: 0.2 })
      gsap.fromTo('.ts-kicker, .ts-sub, .ts-hint',
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out', delay: 0.15 })
      gsap.fromTo(cards.current,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5, stagger: 0.16, ease: 'power2.out', delay: 0.5,
          onStart: () => cards.current.forEach((el) => el && (el.style.opacity = '0')),
          onComplete: render })
    }, root)

    return () => {
      ctx.revert()
      drag.kill()
      window.removeEventListener('resize', onResize)
      stage.current?.removeEventListener('wheel', onWheel)
    }
  }, [])

  /** bring the orbit cards back after a chamber closes */
  const showCards = () => {
    gsap.to(cards.current.filter(Boolean), {
      autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5, stagger: 0.07, ease: 'power2.out',
      onComplete: () => renderRef.current(),
    })
  }

  const closeRite = () => {
    setArmed(null)
    showCards()
  }

  /** verdict claimed → persist, close, spin the next rite forward + knock on the quest door */
  const completeRite = (id: string, score: number, nextIdx: number) => {
    completeTrial(id)
    setTrialScore(id, score)
    if (id === 'signal') setFragsCaught(5)
    setArmed(null)
    showCards()
    chime(523.25, 1.4, 0.06)
    if (nextIdx >= 0) window.setTimeout(() => spinRef.current(nextIdx), 750)
    questEvent({ type: 'rite-clear', id, score }) // evaluates echoes + clears against fresh state
  }

  /** tap a card: front+open → arm the rite · side → orbit it to the front · sealed → deny */
  const choose = (i: number) => {
    if (i !== active) {
      spinRef.current(i) // side-card tap orbits it to face you
      return
    }
    if (!RITES[i].open) {
      const el = cards.current[i]
      if (el) gsap.fromTo(el, { x: 0 }, { x: -7, duration: 0.07, repeat: 5, yoyo: true, ease: 'power1.inOut', clearProps: 'x' })
      blip(false)
      staticBurst(0.14, 0.04)
      return
    }
    if (RITES[i].cleared) questEvent({ type: 'rite-replay', id: RITES[i].id }) // the orbit remembers
    // the rite arms (overlay entrance is state-driven below)
    chime(660, 1.2, 0.1)
    chime(990, 1.6, 0.06)
    riser(1.4, 0.08)
    setArmed(i)
    gsap.to(cards.current.filter(Boolean), { autoAlpha: 0, y: -40, filter: 'blur(8px)', duration: 0.55, stagger: 0.08, ease: 'power2.in' })
  }

  return (
    <div ref={root} style={{ minHeight: '100vh', background: '#04060c', position: 'relative', overflow: 'hidden' }}>
      <Starfield density={220} />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1100, margin: '0 auto', padding: '84px 24px 72px', textAlign: 'center' }}>
        <p className="ts-kicker t-mono" style={{ fontSize: 11, letterSpacing: '.4em', color: 'var(--ember)' }}>
          THE CHAMBER OF AWAKENING
        </p>
        <h1 className="ts-title t-display gt-steel" style={{ fontSize: 'clamp(30px, 5.8vw, 76px)', fontWeight: 900, letterSpacing: '.08em', lineHeight: 1.06, margin: '20px 0 14px' }}>
          THE TRIALS OF AWAKENING
        </h1>
        <p className="ts-sub t-dim" style={{ maxWidth: 540, margin: '0 auto', fontWeight: 300, fontSize: 15, lineHeight: 1.7 }}>
          Three rites ride the orbit. Hold it, yank it, spin it — the one that faces you is the one that tests you.
        </p>

        {/* all three cleared — the Ceremony calls. Lives ABOVE
            the stage: the page is a fixed-screen chamber, bottom chips fall below the fold */}
        {RITES.every((r) => r.cleared) && (
          <Link to="/ceremony" data-cursor="APPROACH" onMouseEnter={() => chime(587.33, 0.9, 0.05)}
            style={{
              display: 'inline-block', marginTop: 18, padding: '10px 26px',
              border: '1px solid rgba(232,180,76,.5)', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.32em',
              color: 'var(--ember)', textDecoration: 'none',
              animation: 'caretBlink 2.4s steps(1) infinite', transition: 'all .3s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(232,180,76,.1)' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}>
            ◈ ALL RITES CLEARED — THE CEREMONY AWAITS · PRESENT YOURSELF ◈
          </Link>
        )}

        {/* ══ THE ORBIT ══ */}
        <div
          ref={stage}
          data-cursor="DRAG"
          style={{
            position: 'relative', height: 400, margin: '30px auto 0', maxWidth: 980,
            touchAction: 'none', userSelect: 'none', cursor: 'grab',
          }}
        >
          {/* orbit guide rings */}
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 'min(78vw, 620px)', height: 'min(78vw, 620px)', transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid rgba(103,232,249,.1)', pointerEvents: 'none' }} />
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 'min(60vw, 460px)', height: 'min(60vw, 460px)', transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px dashed rgba(103,232,249,.14)', pointerEvents: 'none', animation: 'csspSpinA 40s linear infinite' }} />

          {RITES.map((r, i) => (
            <div
              key={r.n}
              ref={(el) => { cards.current[i] = el }}
              className="ts-orbit-card"
              data-cursor={i === active ? (r.cleared ? 'REPLAY' : r.open ? 'BEGIN' : 'SEALED') : 'ORBIT'}
              onClick={() => choose(i)}
              style={{
                position: 'absolute', left: '50%', top: '50%', width: 272, height: 240,
                padding: '24px 22px 20px', textAlign: 'left',
                border: `1px solid ${i === active ? 'rgba(103,232,249,.55)' : 'rgba(103,232,249,.16)'}`,
                background: 'linear-gradient(180deg, rgba(10,16,29,.85), rgba(6,9,16,.92))',
                borderRadius: 8, willChange: 'transform, filter',
                transition: 'border-color .35s',
                boxShadow: i === active ? '0 18px 60px rgba(103,232,249,.14)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="t-display" style={{ fontSize: 32, fontWeight: 700, color: r.open ? (i === active ? 'var(--kyber)' : 'var(--kyber-dim)') : 'var(--ghost)' }}>{r.n}</span>
                <span className="t-mono" style={{ fontSize: 9, letterSpacing: '.26em', color: r.cleared ? 'var(--kyber)' : r.open ? (i === active ? 'var(--ember)' : 'var(--kyber-dim)') : 'var(--ghost)', opacity: .9 }}>
                  {r.cleared ? `◈ CLEARED · ${r.score ?? '—'}/3` : r.open ? (i === active ? '◈ RITE AWAITS' : '◈ OPEN') : '◌ SEALED'}
                </span>
              </div>
              <h3 className="t-display" style={{ marginTop: 12, fontSize: 15, letterSpacing: '.13em', fontWeight: 700, color: 'var(--bone)' }}>{r.name}</h3>
              <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ghost)', fontWeight: 300 }}>{r.desc}</p>
              <div style={{ marginTop: 16, height: 1, background: 'linear-gradient(90deg, transparent, rgba(103,232,249,.35), transparent)' }} />
              <p className="t-mono" style={{ marginTop: 10, fontSize: 9, letterSpacing: '.2em', color: 'var(--kyber-dim)' }}>
                {r.cleared ? '» CLEARED — WALK IT AGAIN' : r.open ? '» TAP WHEN IT FACES YOU' : '» COMPLETE PRIOR RITES'}
              </p>
            </div>
          ))}
        </div>

        {/* RITE IV · INVERSE — THE DEPARTURE. Not a card in the orbit: it appears
            only after the Ceremony mints a name, floating below it — light where
            every rite is dark. It does not test you. It lets you leave. */}
        {callsign && (
          <div
            data-cursor="DEPART"
            data-depart-tile
            onClick={() => { staticBurst(0.22, 0.05); riser(1.2, 0.07); nav('/ending') }}
            onMouseEnter={() => chime(740, 0.8, 0.04)}
            style={{
              margin: '26px auto 0', width: 'fit-content', maxWidth: '88vw', padding: '13px 30px',
              background: 'linear-gradient(180deg, #e8e6df, #cfcabf)', color: '#0a0f1a',
              border: '1px solid rgba(232,230,223,.9)', borderRadius: 6,
              boxShadow: '0 0 44px rgba(232,230,223,.16), 0 8px 30px rgba(0,0,0,.5)',
              cursor: 'none', userSelect: 'none', animation: 'departBob 5.2s ease-in-out infinite',
              transition: 'transform .3s, box-shadow .3s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 0 64px rgba(232,230,223,.32), 0 12px 36px rgba(0,0,0,.5)' }}
            onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 0 44px rgba(232,230,223,.16), 0 8px 30px rgba(0,0,0,.5)' }}
          >
            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.34em', fontWeight: 700 }}>
              IV · THE DEPARTURE — {questsDone.includes('q-departed') ? 'WALK IT AGAIN' : 'THE RITE THAT ENDS ALL RITES'}
            </p>
            <p className="t-mono" style={{ marginTop: 5, fontSize: 8.5, letterSpacing: '.22em', opacity: 0.72 }}>
              YOU LEAVE THE WAY YOU CAME — THROUGH THE RING
            </p>
          </div>
        )}

        <p className="ts-hint t-mono" style={{ marginTop: 26, fontSize: 10, letterSpacing: '.3em', color: 'var(--ghost)', opacity: .85 }}>
          <span style={{ color: 'var(--ember)' }}>HOLD · DRAG · RELEASE</span> — the orbit throws · <span style={{ color: 'var(--kyber-dim)' }}>wheel spins it too</span>
        </p>

        {/* RITE I — THE TRIAL OF SIGNAL (playable chamber) */}
        {armed === 0 && <TrialSignal onExit={closeRite} onComplete={(s) => completeRite('signal', s, 1)} />}

        {/* RITE II — THE TRIAL OF FOCUS (playable chamber) */}
        {armed === 1 && <TrialFocus onExit={closeRite} onComplete={(s) => completeRite('focus', s, 2)} />}

        {/* RITE III — THE TRIAL OF CHOICE (playable chamber) */}
        {armed === 2 && <TrialChoice onExit={closeRite} onComplete={(s) => completeRite('choice', s, -1)} />}

        <Link to="/" data-cursor="RETURN" onMouseEnter={() => blip(false)}
          style={{ display: 'inline-block', marginTop: 44, padding: '12px 30px', border: '1px solid rgba(103,232,249,.3)', color: 'var(--kyber-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.28em', textDecoration: 'none', borderRadius: 4, transition: 'all .3s' }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--kyber)'; e.currentTarget.style.color = 'var(--kyber)' }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(103,232,249,.3)'; e.currentTarget.style.color = 'var(--kyber-dim)' }}>
          ← RETURN TO THE GATE
        </Link>
      </div>
    </div>
  )
}
