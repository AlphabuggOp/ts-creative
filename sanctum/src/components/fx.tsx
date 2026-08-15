import { useEffect, useRef } from 'react'
import { startVelocityBus, velo } from './velocity'

const KYBER = '#67e8f9'
const BONE = '#e8e6df'

/** Film grain overlay — pure CSS/SVG, zero deps */
export function Grain() {
  const style: React.CSSProperties = {
    position: 'fixed', inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 90, opacity: 0.05,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    animation: 'grainShift 1.1s steps(4) infinite',
  }
  return (
    <>
      <style>{`@keyframes grainShift{0%{transform:translate(0,0)}25%{transform:translate(-2%,1%)}50%{transform:translate(1%,-2%)}75%{transform:translate(-1%,2%)}100%{transform:translate(2%,-1%)}}`}</style>
      <div style={style} aria-hidden />
    </>
  )
}

/**
 * Cursor v3 — the cursor is ALIVE:
 *  · scrolls → it recognises motion: stretches + morphs into a direction chevron
 *  · [data-cursor="…"] zones → contextual label (ENTER / SCROLL / DRAG …)
 *  · hoverables (a, button, [data-hot]) → ring expands, dot squashes
 *  · click → spark ripple tears outward from the press point
 * Zero re-renders per frame — everything through refs + one class toggle.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const aura = useRef<HTMLDivElement>(null)
  const chev = useRef<HTMLSpanElement>(null)
  const lab = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(hover: none)').matches) return
    startVelocityBus()
    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const ringPos = { ...pos }
    const auraPos = { ...pos }
    let scale = 1, targetScale = 1, raf = 0
    let curLabel = '', scrolling = false, squashUntil = 0, chevSign = 0
    const setLabel = (t: string) => {
      if (t === curLabel) return
      curLabel = t
      if (lab.current) lab.current.textContent = t
    }
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX; pos.y = e.clientY
      const el = e.target as HTMLElement | null
      const zone = el?.closest?.('[data-cursor]') as HTMLElement | null
      const hot = !!el?.closest?.('a, button, [data-hot]')
      const legacy = el?.closest?.('[data-label]') as HTMLElement | null
      targetScale = zone || hot ? 2.2 : 1
      setLabel(zone?.dataset.cursor || legacy?.dataset.label || (hot ? '◦' : ''))
    }
    const onDown = (e: PointerEvent) => {
      squashUntil = performance.now() + 240
      const r = document.createElement('span')
      r.className = 'cur-ripple'
      r.style.left = `${e.clientX}px`
      r.style.top = `${e.clientY}px`
      document.body.appendChild(r)
      r.animate(
        [{ transform: 'translate(-50%,-50%) scale(.15)', opacity: 0.95 },
         { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }],
        { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' },
      ).onfinish = () => r.remove()
    }
    const loop = () => {
      const sp = velo.speed
      const sc = sp > 0.42 && !curLabel // scroll reading wins unless a zone speaks
      if (sc !== scrolling) {
        scrolling = sc
        ring.current?.classList.toggle('is-scroll', sc)
      }
      if (sc) {
        const sign = velo.v >= 0 ? 1 : -1
        if (sign !== chevSign && chev.current) {
          chevSign = sign
          chev.current.textContent = sign > 0 ? '▽' : '△'
        }
      }
      const lerpR = curLabel ? 0.30 : 0.17
      ringPos.x += (pos.x - ringPos.x) * lerpR
      ringPos.y += (pos.y - ringPos.y) * lerpR
      auraPos.x += (pos.x - auraPos.x) * 0.07
      auraPos.y += (pos.y - auraPos.y) * 0.07
      scale += (targetScale - scale) * 0.15
      const squash = performance.now() < squashUntil ? 0.5 : 1
      const stretchY = 1 + sp * 1.9 // motion stretches the dot along the scroll axis
      if (dot.current) dot.current.style.transform =
        `translate3d(${pos.x}px,${pos.y}px,0) translate(-50%,-50%) scale(${squash}) scaleY(${stretchY})`
      if (ring.current) ring.current.style.transform =
        `translate3d(${ringPos.x}px,${ringPos.y}px,0) translate(-50%,-50%) scale(${scale})`
      if (aura.current) aura.current.style.transform =
        `translate3d(${auraPos.x}px,${auraPos.y}px,0) translate(-50%,-50%) scale(${1 + sp * 1.2})`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      cancelAnimationFrame(raf)
    }
  }, [])
  // z-stack law: cursor must sit ABOVE every overlay (Field Log z-140, toasts z-150)
  // or the global `cursor:none` leaves the user blind inside menus.
  const base: React.CSSProperties = { position: 'fixed', top: 0, left: 0, zIndex: 200, pointerEvents: 'none' }
  return (
    <>
      <div ref={aura} style={{ ...base, zIndex: 199, width: 90, height: 90, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(103,232,249,.22) 0%, rgba(103,232,249,.06) 45%, transparent 70%)',
        filter: 'blur(6px)', mixBlendMode: 'screen' }} />
      <div ref={dot} style={{ ...base, width: 6, height: 6, borderRadius: '50%', background: KYBER, boxShadow: `0 0 12px ${KYBER}` }} />
      <div ref={ring} className="cur-ring" style={{ ...base, width: 38, height: 38, borderRadius: '50%',
        border: '1px solid rgba(103,232,249,.5)', display: 'grid', placeItems: 'center' }}>
        <span ref={chev} className="cur-chev t-mono" aria-hidden>▽</span>
        <span ref={lab} className="cur-label t-mono" aria-hidden />
      </div>
    </>
  )
}

/** Parallax twinkling starfield canvas (kept for non-portal pages). */
export function Starfield({ density = 340 }: { density?: number }) {
  const cvs = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = cvs.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let w = window.innerWidth, h = window.innerHeight, raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const stars = Array.from({ length: density }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random(),
      r: Math.random() * 1.5 + 0.3, p: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 1.6,
    }))
    const mouse = { x: 0, y: 0 }
    const size = () => {
      w = window.innerWidth; h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const onMouse = (e: MouseEvent) => {
      mouse.x = (e.clientX / w - 0.5) * 2
      mouse.y = (e.clientY / h - 0.5) * 2
    }
    let t = 0
    const draw = () => {
      t += 0.016
      ctx.clearRect(0, 0, w, h)
      for (const st of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * st.s + st.p)
        const px = st.x * w - mouse.x * 30 * st.z
        const py = st.y * h - mouse.y * 30 * st.z
        ctx.globalAlpha = tw * (0.3 + st.z * 0.7)
        ctx.fillStyle = st.z > 0.86 ? KYBER : BONE
        ctx.beginPath()
        ctx.arc(px, py, Math.max(st.r * tw, 0.2), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    size()
    window.addEventListener('resize', size)
    window.addEventListener('mousemove', onMouse, { passive: true })
    raf = requestAnimationFrame(draw)
    return () => {
      window.removeEventListener('resize', size)
      window.removeEventListener('mousemove', onMouse)
      cancelAnimationFrame(raf)
    }
  }, [density])
  return (
    <canvas
      ref={cvs}
      className="layer-fixed"
      style={{ zIndex: 0, width: '100%', height: '100%' }}
      aria-hidden
    />
  )
}
