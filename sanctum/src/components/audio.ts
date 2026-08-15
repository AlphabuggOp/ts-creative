/**
 * SANCTUM procedural audio engine — zero audio files for ambience.
 * A breathing temple drone (detuned sines + noise wash), crystal chimes,
 * blips — plus VO playback. Context arms on first user gesture.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let droning = false
let muted = false

/** master mute — Field Log SIGNAL attune. SFX go silent, VO is refused. */
export function setAudioMuted(v: boolean) {
  muted = v
  const c = ensureCtx()
  if (c && master) master.gain.setTargetAtTime(v ? 0 : 0.9, c.currentTime, 0.04)
}

export function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** The Sanctum hum — sub drone + breathing noise wash. Starts once. */
export function startDrone() {
  const c = ensureCtx()
  if (!c || !master || droning) return
  droning = true
  const g = c.createGain()
  g.gain.value = 0
  g.gain.linearRampToValueAtTime(0.06, c.currentTime + 4)
  g.connect(master)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 210
  lp.connect(g)

  for (const [f, amp] of [[55, 0.5], [55.35, 0.42], [27.5, 0.6]] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const og = c.createGain()
    og.gain.value = amp
    o.connect(og).connect(lp)
    o.start()
  }

  // breathing noise wash
  const len = c.sampleRate * 2
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const noise = c.createBufferSource()
  noise.buffer = buf
  noise.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 420
  bp.Q.value = 0.6
  const ng = c.createGain()
  ng.gain.value = 0.008
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.07
  const lfoG = c.createGain()
  lfoG.gain.value = 180
  lfo.connect(lfoG).connect(bp.frequency)
  noise.connect(bp).connect(ng).connect(master)
  lfo.start()
  noise.start()
}

/** Crystal chime — call/response flavor. */
export function chime(freq = 660, dur = 1.6, vol = 0.12) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const p = c.createStereoPanner()
  p.pan.value = Math.random() * 1.4 - 0.7
  o.connect(g).connect(p).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** Tiny UI blip. */
export function blip(up = true) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(up ? 340 : 260, t)
  o.frequency.exponentialRampToValueAtTime(up ? 620 : 180, t + 0.09)
  const g = c.createGain()
  g.gain.setValueAtTime(0.05, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + 0.14)
}

/* ── ACTIVATION TRUTH — wheel is NOT a user activation under autoplay policy.
   Only pointerdown / keydown / touchstart unlock WebAudio. So:
   · SFX fire only while ctx.state === 'running' (no ghost blasts at unlock)
   · VO that fails pre-activation is QUEUED and retried on later real touches
   · mediaDiag: live diagnostics surfaced by the ?debug=1 chip ── */
export const mediaDiag = { status: 'preflight' as 'preflight' | 'ok' | 'blocked', voice: '—' }
let pendingVoice: { src: string; vol: number; t: number; windowSec: number } | null = null
let flushBound = false

/** minimal valid ~50ms PCM wav — tests whether THIS document may play media at all */
function silentWavUrl() {
  const n = 2205
  const buf = new ArrayBuffer(44 + n * 2)
  const dv = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, 44100, true); dv.setUint32(28, 88200, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

/** permanent activation flushers — retry queued VO + sense media capability on EVERY touch */
function bindActivationFlush() {
  if (flushBound || typeof window === 'undefined') return
  flushBound = true
  const onTouch = () => {
    flushPendingVoice()
    if (mediaDiag.status === 'preflight') {
      const url = silentWavUrl()
      new Audio(url).play()
        .then(() => { mediaDiag.status = 'ok'; URL.revokeObjectURL(url) })
        .catch(() => { mediaDiag.status = 'blocked'; URL.revokeObjectURL(url) })
    }
  }
  window.addEventListener('pointerdown', onTouch, { passive: true })
  window.addEventListener('keydown', onTouch)
  window.addEventListener('touchstart', onTouch, { passive: true })
}

/** VO playback; if blocked by autoplay, queues retries for windowSec after its moment.
    onceKey latches the line per browser SESSION — boot lines must not re-narrate every visit. */
export function playVoice(src: string, volume = 1, windowSec = 45, onceKey?: string) {
  if (onceKey) {
    try {
      if (sessionStorage.getItem(`sanctum-vo-${onceKey}`)) return
      sessionStorage.setItem(`sanctum-vo-${onceKey}`, '1')
    } catch { /* private mode — play anyway */ }
  }
  if (typeof Audio === 'undefined' || muted) return
  bindActivationFlush()
  const name = src.split('/').pop() || src
  const a = new Audio(src)
  a.volume = volume
  a.play()
    .then(() => { mediaDiag.voice = `${name} ✓` })
    .catch(() => {
      mediaDiag.voice = `${name} queued`
      pendingVoice = { src, vol: volume, t: performance.now(), windowSec }
    })
}

function flushPendingVoice() {
  const v = pendingVoice
  pendingVoice = null
  if (!v) return
  if (performance.now() - v.t < v.windowSec * 1000) {
    const a = new Audio(v.src)
    a.volume = v.vol
    a.play()
      .then(() => { mediaDiag.voice = `${v.src.split('/').pop()} ✓` })
      .catch(() => { pendingVoice = v }) // still blocked — keep the seat warm
  }
}

/** Arm audio on the FIRST REAL ACTIVATION (pointer/key/touch — never wheel). */
export function armOnFirstGesture(fn: () => void) {
  bindActivationFlush()
  let fired = false
  const arm = () => {
    if (fired) return
    fired = true
    ensureCtx()
    startDrone()
    flushPendingVoice()
    fn()
    chime(880, 0.6, 0.06) // the network answers the touch
  }
  window.addEventListener('pointerdown', arm, { once: true })
  window.addEventListener('keydown', arm, { once: true })
  window.addEventListener('touchstart', arm, { once: true })
}

/* ── Gate v2.3: scroll-synced sound design ──
   Every hit is procedural; volumes tuned for laptop speakers. */

/** Deep transmission hit: pitch-dropping sub + tick. Fires as each line enters. */
export function thud(vol = 0.2) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(118, t)
  o.frequency.exponentialRampToValueAtTime(38, t + 0.26)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g).connect(master)
  o.start(t); o.stop(t + 0.32)
  // tiny foley tick on top
  const nb = noiseBuf(c, 0.05)
  const ns = c.createBufferSource(); ns.buffer = nb
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600
  const ng = c.createGain()
  ng.gain.setValueAtTime(vol * 0.24, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  ns.connect(hp).connect(ng).connect(master)
  ns.start(t)
}

/** Doors swell: brown-ish noise through a low rumble filter, in and out. */
export function swell(dur = 1.8, vol = 0.14) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const ns = c.createBufferSource(); ns.buffer = noiseBuf(c, dur)
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; lp.Q.value = 0.8
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  ns.connect(lp).connect(g).connect(master)
  ns.start(t); ns.stop(t + dur + 0.05)
}

/** Hyperspace riser: bandpass noise sweeps up + rising fifth osc. */
export function riser(dur = 2.6, vol = 0.12) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const ns = c.createBufferSource(); ns.buffer = noiseBuf(c, dur)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4
  bp.frequency.setValueAtTime(220, t)
  bp.frequency.exponentialRampToValueAtTime(3400, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur)
  ns.connect(bp).connect(g).connect(master)
  ns.start(t); ns.stop(t + dur + 0.05)
  const o = c.createOscillator(); o.type = 'triangle'
  o.frequency.setValueAtTime(82.5, t)
  o.frequency.exponentialRampToValueAtTime(123.5, t + dur)
  const og = c.createGain()
  og.gain.setValueAtTime(vol * 0.35, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(og).connect(master)
  o.start(t); o.stop(t + dur + 0.05)
}

/** Breach impact: sub drop + noise splash + shimmer tail. */
export function impact(vol = 0.3) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(96, t)
  o.frequency.exponentialRampToValueAtTime(26, t + 0.7)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
  o.connect(g).connect(master)
  o.start(t); o.stop(t + 1.15)
  const ns = c.createBufferSource(); ns.buffer = noiseBuf(c, 0.5)
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.setValueAtTime(4200, t)
  lp.frequency.exponentialRampToValueAtTime(160, t + 0.5)
  const ng = c.createGain()
  ng.gain.setValueAtTime(vol * 0.5, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  ns.connect(lp).connect(ng).connect(master)
  ns.start(t)
  chime(1568, 2.4, 0.05)
  chime(2093, 3.2, 0.035)
}

/** G15 static foley — short bandpass-noise crackle, random center freq each hit. */
export function staticBurst(dur = 0.22, vol = 0.055) {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const ns = c.createBufferSource(); ns.buffer = noiseBuf(c, dur + 0.06)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9
  bp.frequency.value = 900 + Math.random() * 2600
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  ns.connect(bp).connect(g).connect(master)
  ns.start(t); ns.stop(t + dur + 0.07)
}

/**
 * Trial of Signal — the tuner chain. A bed of tracked static with a buried
 * carrier tone (528Hz + 3:2 harmonic). `set(clarity, tune)` is called every
 * frame by the dial; returns null until the context is truly running,
 * so callers lazily retry (activation-safe per the war of the silent network).
 */
export function signalScope(): { set: (clarity: number, tune01: number) => void; stop: () => void } | null {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return null
  // static bed — looped noise through a bandpass that tracks the dial
  const ns = c.createBufferSource()
  ns.buffer = noiseBuf(c, 2)
  ns.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.1
  bp.frequency.value = 480
  const ng = c.createGain()
  ng.gain.value = 0.001
  ns.connect(bp).connect(ng).connect(master)
  ns.start()
  // the buried carrier + its 3:2 harmonic
  const o1 = c.createOscillator()
  o1.type = 'sine'
  o1.frequency.value = 528
  const o2 = c.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = 792
  const g1 = c.createGain()
  g1.gain.value = 0
  const g2 = c.createGain()
  g2.gain.value = 0
  o1.connect(g1).connect(master)
  o2.connect(g2).connect(master)
  o1.start()
  o2.start()
  // gentle gate flutter when the lock is near
  const lfo = c.createOscillator()
  lfo.frequency.value = 5.2
  const lg = c.createGain()
  lg.gain.value = 0
  lfo.connect(lg).connect(g1.gain)
  lfo.start()
  let stopped = false
  return {
    set(clarity, tune01) {
      if (stopped) return
      const t = c.currentTime
      ng.gain.setTargetAtTime(Math.pow(1 - clarity, 1.5) * 0.085 + 0.0015, t, 0.05)
      bp.frequency.setTargetAtTime(240 + tune01 * 3000, t, 0.03)
      g1.gain.setTargetAtTime(Math.pow(clarity, 1.6) * 0.1, t, 0.05)
      g2.gain.setTargetAtTime(Math.pow(clarity, 1.9) * 0.034, t, 0.05)
      lg.gain.setTargetAtTime(clarity > 0.72 && clarity < 1 ? 0.018 : 0, t, 0.1)
    },
    stop() {
      if (stopped) return
      stopped = true
      const t = c.currentTime
      ng.gain.setTargetAtTime(0, t, 0.06)
      g1.gain.setTargetAtTime(0, t, 0.05)
      g2.gain.setTargetAtTime(0, t, 0.05)
      lg.gain.setTargetAtTime(0, t, 0.04)
      setTimeout(() => {
        try { ns.stop(); o1.stop(); o2.stop(); lfo.stop() } catch { /* sources already down */ }
      }, 400)
    },
  }
}

/**
 * Trial of Focus — the beacon hum. A held 396Hz voice with a sub-octave bed;
 * when your light slips outside the ring, the hum wobbles and detunes
 * (stability < 1), when you hold steady it rings pure. Lazy/running-gated
 * like signalScope — callers retry until the context truly runs.
 */
export function focusHum(): { set: (stability: number) => void; stop: () => void } | null {
  const c = ensureCtx()
  if (!c || !master || c.state !== 'running') return null
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.value = 396
  const sub = c.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = 198
  const g = c.createGain()
  g.gain.value = 0
  const gs2 = c.createGain()
  gs2.gain.value = 0.45
  const wob = c.createOscillator()
  wob.frequency.value = 7.3
  const wobG = c.createGain()
  wobG.gain.value = 0
  wob.connect(wobG).connect(o.frequency)
  wob.start()
  o.connect(g)
  sub.connect(gs2).connect(g)
  g.connect(master)
  o.start()
  sub.start()
  let stopped = false
  return {
    set(stability) {
      if (stopped) return
      const t = c.currentTime
      g.gain.setTargetAtTime(0.035 + stability * 0.05, t, 0.09)
      wobG.gain.setTargetAtTime((1 - stability) * 11, t, 0.12)
      o.frequency.setTargetAtTime(388 + stability * 8, t, 0.1)
    },
    stop() {
      if (stopped) return
      stopped = true
      const t = c.currentTime
      g.gain.setTargetAtTime(0, t, 0.08)
      wobG.gain.setTargetAtTime(0, t, 0.05)
      setTimeout(() => {
        try { o.stop(); sub.stop(); wob.stop() } catch { /* already down */ }
      }, 400)
    },
  }
}

function noiseBuf(c: AudioContext, dur: number) {
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}
