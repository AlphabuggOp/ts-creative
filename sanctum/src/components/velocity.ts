/**
 * VelocityBus — one shared, buttery scroll-velocity signal.
 * Sources: native window scroll (Lenis drives it). Consumers: cursor v3
 * (chevron morph), RGB-split chroma foley (CSS var --ss), anything else.
 * Writes --sv (signed -1..1) and --ss (speed 0..1) onto :root every frame.
 */
let started = false
let sv = 0
let ss = 0
let target = 0
let lastY = 0

export const velo = {
  get v() { return sv },
  get speed() { return ss },
}

export function startVelocityBus() {
  if (started || typeof window === 'undefined') return
  started = true
  lastY = window.scrollY
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY
      target = Math.max(-1, Math.min(1, (y - lastY) / 48))
      lastY = y
    },
    { passive: true },
  )
  const rootEl = document.documentElement
  let veloOn = false
  const loop = () => {
    target *= 0.88 // impulse decays — a flick reads as a spike, not a plateau
    sv += (target - sv) * 0.16
    ss += (Math.abs(target) * 1.4 - ss) * 0.12
    rootEl.style.setProperty('--sv', sv.toFixed(3))
    rootEl.style.setProperty('--ss', Math.min(1, Math.max(0, ss)).toFixed(3))
    // chroma gate with hysteresis — shadows exist ONLY during real motion
    if (!veloOn && ss > 0.25) { veloOn = true; rootEl.classList.add('velo-on') }
    else if (veloOn && ss < 0.12) { veloOn = false; rootEl.classList.remove('velo-on') }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
