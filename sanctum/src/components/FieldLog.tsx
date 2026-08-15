import { useEffect, useState } from 'react'
import gsap from 'gsap'
import { useSanctum } from '../store'
import { QUESTS } from '../game/quests'
import { blip, chime, setAudioMuted as applyAudioMuted } from './audio'
import { RITE_INFO } from '../routes/Trials'
import { FRAGMENTS } from './TrialSignal'
import { DILEMMAS } from './TrialChoice'
import Sigil, { computeIdentity } from './Sigil'

/* ── THE FIELD LOG ──────────────────────────────────────────────
   The living dossier. Burger chip (top-left, every route) or Esc.
   IDENTITY · TASK LOG · QUESTS · ARCHIVE · SIGNAL. Reads the store;
   never touches game state except SIGNAL attune + the forget key. */

const TABS = ['IDENTITY', 'TASK LOG', 'QUESTS', 'ARCHIVE', 'SIGNAL'] as const

const LORE = [
  { gate: 'q-read', text: 'THE NETWORK PRE-DATES THE EMPIRE’S LISTENING. THE STATIC WAS OURS FIRST.' },
  { gate: 'q-motes', text: 'THE WHISPERS ARE WHAT STATIC DREAMS ABOUT.' },
  { gate: 'q-paths6', text: 'A MIND THAT NEVER SPLITS IS A MAP WITHOUT ROADS.' },
]

export default function FieldLog() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(0)
  const [forgetArmed, setForgetArmed] = useState(false)

  const s = useSanctum() // the log watches everything

  /* Esc: chambers own it first — if any trial overlay is live, the log stays shut */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      const chamberOpen = document.querySelector('[data-tsg-phase],[data-tfc-phase],[data-tch-phase]')
      setOpen((o) => (o ? false : chamberOpen ? o : true))
      setForgetArmed(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  /* digit tabs while open */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= TABS.length) setTab(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /* re-apply persisted mute to the live engine on boot */
  useEffect(() => {
    if (useSanctum.getState().audioMuted) applyAudioMuted(true)
  }, [])

  /* entrances — state-driven per the commit-race law */
  useEffect(() => {
    if (!open) return
    gsap.fromTo('.fl-panel', { autoAlpha: 0, scale: 0.965, y: 14 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: 'expo.out' })
    gsap.fromTo('.fl-body > *', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.03, ease: 'power2.out', delay: 0.12 })
  }, [open, tab])

  const totalEcho = Object.values(s.riteScores).reduce((a, b) => a + b, 0)
  const questCount = s.questsDone.length
  const riteState = (i: number, id: string) =>
    s.trialsDone.includes(id) ? 2 : i === 0 || s.trialsDone.includes(RITE_INFO[i - 1].id) ? 1 : 0

  const forget = () => {
    if (!forgetArmed) { setForgetArmed(true); blip(false); return }
    localStorage.removeItem('sanctum-save-v1')
    window.location.reload()
  }

  return (
    <>
      {/* burger chip — every route, even mid-seal */}
      <button
        data-fl-burger
        data-cursor="LOG"
        aria-label="field log"
        onClick={() => { setOpen((o) => !o); setForgetArmed(false); chime(659.25, 0.5, 0.05) }}
        className="fl-burger"
      >
        <i /><i /><i />
      </button>

      {open && (
        <div data-fl className="fl-veil" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="fl-panel" style={{ opacity: 0 }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.42em', color: 'var(--ember)' }}>◈ FIELD LOG</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TABS.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => { setTab(i); blip(true) }}
                    data-cursor="LOG"
                    className="fl-tab"
                    data-on={tab === i ? 1 : 0}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ margin: '14px 0 16px', height: 1, background: 'linear-gradient(90deg, rgba(103,232,249,.4), transparent)' }} />

            <div className="fl-body" key={tab}>
              {/* ── IDENTITY ── */}
              {tab === 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {s.callsign ? (
                      /* the minted mark — same play, same sigil, forever */
                      <Sigil {...(() => { const id = computeIdentity(s); return { total: id.total, riteIdx: id.riteIdx, leanIdx: id.leanIdx } })()} size={76} />
                    ) : (
                      /* placeholder star — the Ceremony hasn't been held */
                      <svg width="76" height="76" viewBox="0 0 100 100" fill="none" style={{ flex: 'none', opacity: 0.55 }} aria-hidden>
                        <circle cx="50" cy="50" r="46" stroke="var(--kyber)" strokeWidth="1.3" pathLength={1} strokeDasharray={1} opacity={0.85} />
                        <path d="M50 14 L56 44 L86 50 L56 56 L50 86 L44 56 L14 50 L44 44 Z" stroke="var(--kyber)" strokeWidth="1.3" fill="rgba(103,232,249,.07)" />
                        <circle cx="50" cy="50" r="5" fill="var(--ember)" />
                      </svg>
                    )}
                    <div>
                      <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ghost)' }}>CALLSIGN</p>
                      <h3 className="t-display" style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 900, letterSpacing: '.1em', color: 'var(--bone)', marginTop: 4 }}>
                        {s.callsign ?? '— UNMINTED —'}
                      </h3>
                      <p className="t-mono" style={{ marginTop: 6, fontSize: 10, letterSpacing: '.26em', color: s.rank ? 'var(--kyber)' : 'var(--ember)' }}>
                        {s.rank ? s.rank.toUpperCase() + ' OF THE NETWORK' : 'RANK: THE CEREMONY AWAITS'}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 22, flexWrap: 'wrap' }}>
                    {[
                      ['TOTAL ECHO', `${totalEcho}/9`],
                      ['RITES CLEARED', `${s.trialsDone.length}/3`],
                      ['QUESTS SEALED', `${questCount}/${QUESTS.length}`],
                      ['WHISPERS', `${s.motesFound.length}/3`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.26em', color: 'var(--ghost)' }}>{k}</p>
                        <p className="t-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--kyber)', marginTop: 4 }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TASK LOG ── */}
              {tab === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {RITE_INFO.map((r, i) => {
                    const st = riteState(i, r.id)
                    return (
                      <div key={r.id} className="fl-row" data-on={st}>
                        <span className="t-display" style={{ fontSize: 20, fontWeight: 800, color: st === 2 ? 'var(--kyber)' : st === 1 ? 'var(--ember)' : 'var(--ghost)', width: 30 }}>{r.n}</span>
                        <div style={{ flex: 1 }}>
                          <p className="t-display" style={{ fontSize: 13, letterSpacing: '.1em', fontWeight: 700, color: 'var(--bone)' }}>{r.name}</p>
                          <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ghost)', marginTop: 3 }}>{r.desc.toUpperCase()}</p>
                        </div>
                        <span className="t-mono" style={{ fontSize: 9, letterSpacing: '.22em', color: st === 2 ? 'var(--kyber)' : st === 1 ? 'var(--ember)' : 'var(--ghost)' }}>
                          {st === 2 ? `◈ CLEARED · ECHO ${s.riteScores[r.id] ?? 0}/3` : st === 1 ? '◌ OPEN' : '◌ SEALED'}
                        </span>
                      </div>
                    )
                  })}
                  {/* master band record — the ladder the signal keeps */}
                  <div className="fl-row" data-on={s.masterBest > 0 ? 2 : 0}>
                    <span className="t-display" style={{ fontSize: 20, fontWeight: 800, color: s.masterBest > 0 ? 'var(--ember)' : 'var(--ghost)', width: 30 }}>∞</span>
                    <div style={{ flex: 1 }}>
                      <p className="t-display" style={{ fontSize: 13, letterSpacing: '.1em', fontWeight: 700, color: 'var(--bone)' }}>THE MASTER BAND</p>
                      <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ghost)', marginTop: 3 }}>ENDLESS RETUNE LADDER INSIDE THE TRIAL OF SIGNAL — BOLDFACE STREAKS ONLY</p>
                    </div>
                    <span className="t-mono" style={{ fontSize: 9, letterSpacing: '.22em', color: s.masterBest > 0 ? 'var(--ember)' : 'var(--ghost)' }}>
                      {s.masterBest > 0 ? `◈ BEST ×${s.masterBest}` : '◌ UNRUN — CLEAR SIGNAL, THEN ASCEND'}
                    </span>
                  </div>
                </div>
              )}

              {/* ── QUESTS ── */}
              {tab === 2 && (
                <div>
                  <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ghost)' }}>
                    SEALED {questCount}/{QUESTS.length} — secret objectives. The log notices everything.
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 'min(44vh, 380px)', overflowY: 'auto', paddingRight: 4 }}>
                    {QUESTS.map((q) => {
                      const done = s.questsDone.includes(q.id)
                      const prog = q.progress?.(s)
                      return (
                        <div key={q.id} className="fl-row" data-on={done ? 2 : 0} data-fl-quest={q.id}>
                          <span style={{ color: done ? 'var(--kyber)' : 'var(--ghost)', fontSize: 11, width: 18 }}>{done ? '◈' : '◇'}</span>
                          <div style={{ flex: 1 }}>
                            <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.2em', color: done ? 'var(--kyber)' : 'var(--bone)' }}>{q.name}</p>
                            <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.12em', color: 'var(--ghost)', marginTop: 2 }}>{q.hint}</p>
                          </div>
                          {prog && <span className="t-mono" style={{ fontSize: 9, letterSpacing: '.18em', color: done ? 'var(--kyber)' : 'var(--ember)' }}>{prog}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── ARCHIVE ── */}
              {tab === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'min(46vh, 400px)', overflowY: 'auto', paddingRight: 4 }}>
                  <div>
                    <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ember)' }}>THE ARCHIVIST’S TRANSMISSION</p>
                    {FRAGMENTS.map((f, i) => (
                      <p key={f} className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.12em', marginTop: 7, color: s.fragsCaught > i ? 'var(--kyber-dim)' : 'var(--ghost)' }}>
                        {s.fragsCaught > i ? f : '· · · UNCAUGHT · · ·'}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ember)' }}>YOUR JUDGMENTS</p>
                    {DILEMMAS.map((dd, i) => (
                      <div key={dd.n} style={{ marginTop: 7 }}>
                        <p className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--bone)' }}>{dd.n}. {dd.title}</p>
                        <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.12em', color: 'var(--ghost)', marginTop: 2 }}>
                          {(['a', 'b'] as const).map((side) => s.pathsWalked.includes(`${i}${side}`) ? `${dd[side].head} ◈ ` : '').join('') || 'no judgment rendered'}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="t-mono" style={{ fontSize: 9, letterSpacing: '.3em', color: 'var(--ember)' }}>DEEPER RECORDS</p>
                    {LORE.map((l) => (
                      <p key={l.gate} className="t-mono" style={{ fontSize: 9.5, letterSpacing: '.12em', marginTop: 7, color: s.questsDone.includes(l.gate) ? 'var(--kyber-dim)' : 'var(--ghost)' }}>
                        {s.questsDone.includes(l.gate) ? l.text : '· · · SEALED BY QUEST · · ·'}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SIGNAL ── */}
              {tab === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="fl-row" data-on={2}>
                    <div style={{ flex: 1 }}>
                      <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--bone)' }}>THE SIGNAL</p>
                      <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.14em', color: 'var(--ghost)', marginTop: 3 }}>ALL SOUND — THE NETWORK’S VOICE</p>
                    </div>
                    <button
                      onClick={() => { s.setAudioMuted(!s.audioMuted); chime(s.audioMuted ? 660 : 330, 0.5, 0.06) }}
                      data-fl-audio
                      data-cursor="ATTUNE"
                      className="fl-tab"
                      data-on={1}
                      style={{ letterSpacing: '.26em' }}
                    >
                      {s.audioMuted ? '◌ MUTED — TAP TO ATTUNE' : '◈ ATTUNED — TAP TO MUTE'}
                    </button>
                  </div>
                  <div className="fl-row" data-on={0}>
                    <div style={{ flex: 1 }}>
                      <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--bone)' }}>FORGET THE NETWORK</p>
                      <p className="t-mono" style={{ fontSize: 8.5, letterSpacing: '.14em', color: 'var(--ghost)', marginTop: 3 }}>WIPE EVERYTHING THE SANCTUM REMEMBERS</p>
                    </div>
                    <button
                      onClick={forget}
                      data-fl-forget
                      data-cursor="CAUTION"
                      className="fl-tab"
                      data-on={0}
                      style={{ color: 'var(--ember)', borderColor: 'rgba(232,180,76,.35)', letterSpacing: '.26em' }}
                    >
                      {forgetArmed ? '» TAP AGAIN TO BE FORGOTTEN' : 'FORGET'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="t-mono" style={{ marginTop: 18, fontSize: 8.5, letterSpacing: '.24em', color: 'var(--ghost)', opacity: 0.8 }}>
              <span className="tsg-key">ESC</span> close · <span className="tsg-key">1–5</span> sections · the log travels with you
            </p>
          </div>
        </div>
      )}
    </>
  )
}
