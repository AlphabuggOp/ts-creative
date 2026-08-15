import { useEffect, useRef } from 'react'

const POOL = 'ΞΔΨΩΣΦ◈▓▒░<>/|\\01ﺡखअ◊'.split('')

/** Glyphs raining down the void — surveillance-decay texture for the Gate's sealed phase.
 *  Canvas, ~30fps, additive, ~9% presence. Pure canvas: zero React re-renders. */
export default function GlyphRain({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, raf = 0, frame = 0
    type Col = { x: number; y: number; speed: number; len: number }
    let cols: Col[] = []

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = canvas.width = Math.floor(r.width)
      h = canvas.height = Math.floor(r.height)
      const n = Math.floor(w / 26)
      cols = Array.from({ length: n }, (_, i) => ({
        x: i * 26 + 13 + (Math.random() * 8 - 4),
        y: Math.random() * h,
        speed: 0.6 + Math.random() * 1.7,
        len: 6 + Math.floor(Math.random() * 12),
      }))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (++frame % 2) return // 30fps is plenty for rain
      ctx.clearRect(0, 0, w, h)
      ctx.font = '13px "IBM Plex Mono", monospace'
      ctx.textAlign = 'center'
      for (const c of cols) {
        c.y += c.speed * 2
        const headY = c.y % (h + c.len * 18)
        for (let i = 0; i < c.len; i++) {
          const y = headY - i * 17
          if (y < -18 || y > h + 18) continue
          const t = i / c.len
          const a = (1 - t) * (i === 0 ? 0.85 : 0.34)
          ctx.fillStyle = `rgba(103,232,249,${a.toFixed(3)})`
          ctx.fillText(POOL[(Math.random() * POOL.length) | 0], c.x, y)
        }
      }
    }
    draw()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <canvas ref={ref} className={className} aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.1, mixBlendMode: 'screen', pointerEvents: 'none', ...style }} />
  )
}
