import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { mediaDiag } from './audio'

/**
 * GL INSURANCE — the portal must survive machines with dead WebGL.
 * 1. glOk()      → detect once; if false, never mount the WebGL canvas.
 * 2. GLBoundary  → any fiber/three crash degrades to the CSS portal, never black.
 * 3. CSSPortal   → always-on DOM portal UNDER the GL canvas (doubles as glow base).
 * 4. markGLLost  → context-loss handler can fade the canvas out; CSS portal shows.
 * 5. GLDebug     → ?debug=1 corner readout (GL state · renderer · fps · scroll p).
 */
export const gl = { ok: true, lost: false, dead: false, renderer: 'unknown' }
let cached: boolean | null = null

export function glOk(): boolean {
  if (cached !== null) return cached
  return detectGl()
}

function detectGl(): boolean {
  try {
    const c = document.createElement('canvas')
    const g2 = c.getContext('webgl2') as WebGL2RenderingContext | null
    const g1 = (g2 ? null : c.getContext('webgl')) as WebGLRenderingContext | null
    const g = (g2 || g1) as WebGLRenderingContext | null
    if (!g) {
      cached = false
    } else {
      const dbg = g.getExtension('WEBGL_debug_renderer_info') as
        | (OES_standard_derivatives & { UNMASKED_RENDERER_WEBGL: number })
        | null
      gl.renderer = dbg
        ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(g.getParameter(g.RENDERER) || 'webgl')
      cached = true
    }
  } catch {
    cached = false
  }
  gl.ok = cached
  return cached
}

/** Cold-start GPU processes can answer null once, then work moments later.
 *  A false is never final — recheck clears the cache and re-detects. */
export function glRecheck(): boolean {
  cached = null
  gl.lost = false
  gl.dead = false
  return detectGl()
}

export function markGLLost() {
  gl.lost = true
}

/* sub-progress copies (kept local so this module never imports three) */
const sm = (x: number) => x * x * (3 - 2 * x)
const ez = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const c01 = (x: number) => Math.min(Math.max(x, 0), 1)
const assembleOf = (p: number) => ez(c01((p - 0.53) / 0.17))
const flightOf = (p: number) => c01((p - 0.66) / 0.28)

/** DOM portal — layered conic swirls + rim + throat, driven by the same scroll p. */
export function CSSPortal({ prog }: { prog: { p: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        el.style.setProperty('--pa', assembleOf(prog.p).toFixed(3))
        el.style.setProperty('--pf', sm(flightOf(prog.p)).toFixed(3))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [prog])
  return (
    <div ref={ref} className="cssp" aria-hidden>
      <div className="cssp-halo" />
      <div className="cssp-spin">
        <div className="cssp-sw a" />
        <div className="cssp-sw b" />
      </div>
      <div className="cssp-rim" />
      <div className="cssp-core" />
      <div className="cssp-throat" />
    </div>
  )
}

/** Crash degrades to the CSS portal beneath — with self-healing retries. */
export class GLBoundary extends Component<{ children: ReactNode }, { err: boolean; attempt: number }> {
  state = { err: false, attempt: 0 }
  private timer?: ReturnType<typeof setTimeout>
  static getDerivedStateFromError() {
    return { err: true }
  }
  componentDidCatch() {
    gl.dead = true
    // two self-heal attempts — a transient GPU hiccup must not kill the show
    if (this.state.attempt < 2) {
      this.timer = setTimeout(
        () => this.setState((s) => ({ err: false, attempt: s.attempt + 1 })),
        1500 + this.state.attempt * 1500,
      )
    }
  }
  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer)
  }
  render() {
    if (this.state.err) return null
    return <div key={this.state.attempt} style={{ position: 'absolute', inset: 0 }}>{this.props.children}</div>
  }
}

/** ?debug=1 — corner HUD: GL state, renderer string, fps, DPR, live scroll p. */
export function GLDebug({ prog }: { prog: { p: number } }) {
  const [show] = useState(
    () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'),
  )
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!show) return
    let frames = 0
    let last = performance.now()
    const tick = () => {
      frames++
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    const id = setInterval(() => {
      const now = performance.now()
      const fps = Math.round((frames * 1000) / Math.max(1, now - last))
      frames = 0
      last = now
      const state = !glOk() ? 'OFF' : gl.dead ? 'DEAD' : gl.lost ? 'LOST' : 'OK'
      if (ref.current) {
        const stamp = typeof __SANCTUM_STAMP__ !== 'undefined' ? __SANCTUM_STAMP__ : 'unstamped'
        ref.current.textContent =
          `b[${stamp}] · WEBGL ${state} · ${gl.renderer.slice(0, 26)} · ${fps}fps · p ${prog.p.toFixed(3)} ` +
          `· media ${mediaDiag.status} · VO ${mediaDiag.voice}`
      }
    }, 500)
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf)
    }
  }, [show, prog])
  if (!show) return null
  return <div ref={ref} className="gl-debug t-mono" />
}
