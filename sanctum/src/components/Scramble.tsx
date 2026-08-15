import { useCallback, useEffect, useRef, useState } from 'react'

const POOL = '!<>-_\\/[]{}—=+*^?#░▒▓ΞΔΨΩ'

type Props = {
  text: string
  /** seconds before first glyph appears */
  delay?: number
  /** ms per character position (left→right sweep) */
  charMs?: number
  /** how long a position stays scrambled before resolving */
  scrambleMs?: number
  /** start condition — drive with scroll/scrolltrigger state */
  start?: boolean
  /** re-scramble on hover */
  hover?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * Decode-style text reveal: characters sweep in left→right as cycling glyphs,
 * then resolve to the true glyph. Used across SANCTUM for "decryption" flavor.
 */
export default function Scramble({
  text,
  delay = 0,
  charMs = 30,
  scrambleMs = 340,
  start = true,
  hover = false,
  className,
  style,
}: Props) {
  const [out, setOut] = useState('')
  const raf = useRef(0)

  const run = useCallback(() => {
    cancelAnimationFrame(raf.current)
    const t0 = performance.now() + delay * 1000
    const tick = (now: number) => {
      const el = now - t0
      if (el < 0) {
        setOut('')
        raf.current = requestAnimationFrame(tick)
        return
      }
      let s = ''
      let done = true
      for (let i = 0; i < text.length; i++) {
        const appearAt = i * charMs
        const resolveAt = appearAt + scrambleMs
        if (text[i] === ' ') {
          s += ' '
          continue
        }
        if (el >= resolveAt) s += text[i]
        else if (el >= appearAt) {
          s += POOL[(Math.random() * POOL.length) | 0]
          done = false
        } else done = false
      }
      setOut(s)
      if (!done) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [text, delay, charMs, scrambleMs])

  useEffect(() => {
    if (start) run()
    return () => cancelAnimationFrame(raf.current)
  }, [start, run])

  return (
    <span
      className={className}
      style={style}
      aria-label={text}
      onMouseEnter={hover ? run : undefined}
      data-hot={hover ? true : undefined}
    >
      {out || ' '}
    </span>
  )
}
