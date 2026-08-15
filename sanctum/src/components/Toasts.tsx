import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useToasts } from '../game/quests'

/** Quest-seal toast rail — top-right, state-driven entrances (commit-race law). */
export default function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const drop = useToasts((s) => s.drop)
  const timers = useRef<Record<number, number>>({})

  useEffect(() => {
    toasts.forEach((t) => {
      if (timers.current[t.id]) return
      const el = document.querySelector(`[data-toast="${t.id}"]`)
      if (el) gsap.fromTo(el, { autoAlpha: 0, x: 34, scale: 0.96 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.45, ease: 'expo.out' })
      timers.current[t.id] = window.setTimeout(() => {
        const node = document.querySelector(`[data-toast="${t.id}"]`)
        if (node) gsap.to(node, { autoAlpha: 0, x: 24, duration: 0.35, ease: 'power2.in', onComplete: () => drop(t.id) })
        else drop(t.id)
        delete timers.current[t.id]
      }, 3600)
    })
  }, [toasts, drop])

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach((id) => clearTimeout(id))
  }, [])

  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 150, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', maxWidth: 'min(88vw, 340px)' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          data-toast={t.id}
          style={{
            padding: '12px 16px', borderRadius: 6, border: '1px solid rgba(103,232,249,.4)',
            background: 'linear-gradient(180deg, rgba(12,19,34,.94), rgba(6,9,16,.97))',
            boxShadow: '0 14px 44px rgba(0,0,0,.55), 0 0 26px rgba(103,232,249,.08)',
            opacity: 0,
          }}
        >
          <p className="t-mono" style={{ fontSize: 10, letterSpacing: '.26em', color: 'var(--kyber)' }}>◈ {t.title}</p>
          {t.sub && <p className="t-mono" style={{ marginTop: 5, fontSize: 8.5, letterSpacing: '.14em', color: 'var(--ghost)' }}>{t.sub}</p>}
        </div>
      ))}
    </div>
  )
}
