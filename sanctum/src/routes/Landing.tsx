import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'

const BOOT_LINES = ['ESTABLISHING SECURE UPLINK', 'MASKING SIGNATURE', 'CHANNEL OPEN']

/** Original SANCTUM sigil — eight-point star in a broken ring */
function Sigil({ size = 84 }: { size?: number }) {
  return (
    <svg className="sigil" width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <circle cx="50" cy="50" r="46" stroke="var(--kyber)" strokeWidth="1.4"
        strokeDasharray="210 80" strokeLinecap="round" />
      <path d="M50 14 L56 44 L86 50 L56 56 L50 86 L44 56 L14 50 L44 44 Z"
        stroke="var(--kyber)" strokeWidth="1.4" fill="rgba(103,232,249,.06)" />
      <circle cx="50" cy="50" r="5" fill="var(--ember)" />
    </svg>
  )
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.boot-line', { opacity: 0, y: 8 }, {
        opacity: 1, y: 0, duration: 0.5, stagger: 0.55,
      })
      tl.to('.boot-line', { opacity: 0.28, duration: 0.5, delay: 0.4 })
      tl.fromTo('.sigil', { opacity: 0, scale: 0.8, rotate: -30 },
        { opacity: 1, scale: 1, rotate: 0, duration: 1.2, ease: 'expo.out' }, '-=0.2')
      tl.fromTo('.word span', { opacity: 0, y: 26, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.09 }, '-=0.5')
      tl.fromTo('.sub, .hint', { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15 }, '-=0.3')
      gsap.to('.hint', { opacity: 0.35, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 2 })
      gsap.to('.sigil', { rotate: 360, duration: 60, repeat: -1, ease: 'none' })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root} style={{ position: 'relative', zIndex: 2, minHeight: '100vh',
      display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div className="t-mono t-dim" style={{ fontSize: 12, display: 'grid', gap: 6, marginBottom: 40 }}>
          {BOOT_LINES.map(l => <span key={l} className="boot-line">» {l} …</span>)}
        </div>
        <div style={{ marginBottom: 28 }} data-hot><Sigil /></div>
        <h1 className="t-display word" style={{ fontSize: 'clamp(44px, 9vw, 110px)', fontWeight: 900, lineHeight: 1 }}>
          {'SANCTUM'.split('').map((c, i) => <span key={i} style={{ display: 'inline-block' }}>{c}</span>)}
        </h1>
        <p className="sub t-mono t-kyber" style={{ marginTop: 22, fontSize: 13, letterSpacing: '.35em' }}>
          THE HIDDEN NETWORK OF THE HCET SYNDICATE
        </p>
        <p className="sub t-dim" style={{ marginTop: 14, fontSize: 15, fontWeight: 300 }}>
          You were not meant to find this place. Something in you disagrees.
        </p>
        <p className="hint t-mono" style={{ marginTop: 64, fontSize: 12, letterSpacing: '.3em', color: 'var(--ember)' }}>
          ▽ SCROLL TO ATTUNE — PHASE 1: THE GATE ▽
        </p>
      </div>
    </div>
  )
}
