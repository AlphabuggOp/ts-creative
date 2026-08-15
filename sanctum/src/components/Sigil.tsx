/* ── THE SIGIL — a geometric identity mark minted from how you played ─────
   Deterministic in (total echo · dominant rite · path lean): same play,
   same mark, forever. The Ceremony reveals it; the Field Log carries it. */

import type { CSSProperties, ReactNode } from 'react'

export const RITE_IDS = ['signal', 'focus', 'choice'] as const
export const RITE_COLORS = ['#67e8f9', '#b79cff', '#e8b44c'] as const

/* [dominant rite][path lean] — nine names, all minted from real play */
export const CALLSIGNS: readonly (readonly string[])[] = [
  ['KESTREL', 'HALCYON', 'LUMEN'], // signal-dominant — the listeners
  ['NIMBUS', 'AURIC', 'SOLSTICE'], // focus-dominant — the steady
  ['WAYFARER', 'VESPER', 'EMBER'], // choice-dominant — the deciders
]

export type Rank = 'Youngling' | 'Padawan' | 'Knight'

export function rankOf(total: number): Rank {
  if (total >= 6) return 'Knight'
  if (total >= 3) return 'Padawan'
  return 'Youngling'
}

export type Identity = {
  total: number
  riteIdx: 0 | 1 | 2
  leanIdx: 0 | 1 | 2
  rank: Rank
  callsign: string
}

/** compute the whole identity from raw play records */
export function computeIdentity(s: { riteScores: Record<string, number>; pathsWalked: string[] }): Identity {
  const scores = RITE_IDS.map((id) => s.riteScores[id] ?? 0)
  const total = Math.min(scores[0] + scores[1] + scores[2], 9)
  let riteIdx = 0
  for (let i = 1; i < 3; i++) if (scores[i] > scores[riteIdx]) riteIdx = i
  const a = s.pathsWalked.filter((p) => p.endsWith('a')).length
  const b = s.pathsWalked.filter((p) => p.endsWith('b')).length
  const leanIdx = a > b ? 0 : b > a ? 1 : 2
  return {
    total,
    riteIdx: riteIdx as 0 | 1 | 2,
    leanIdx: leanIdx as 0 | 1 | 2,
    rank: rankOf(total),
    callsign: CALLSIGNS[riteIdx][leanIdx],
  }
}

/** the mark itself — outer ring, leaning diamond, echo-arcs, ember heart */
export default function Sigil({
  total,
  riteIdx,
  leanIdx,
  size = 100,
  animate = false,
}: {
  total: number
  riteIdx: number
  leanIdx: number
  size?: number
  animate?: boolean
}) {
  const color = RITE_COLORS[riteIdx] ?? RITE_COLORS[0]
  const seed = (total * 131 + riteIdx * 17 + leanIdx * 7 + 11) >>> 0
  const n = 1 + Math.min(Math.max(total, 0), 8) // 1..9 echo-arcs — a denser mark for a louder record
  const inFx = (i: number): CSSProperties | undefined =>
    animate
      ? { transformOrigin: '50px 50px', animation: `sigilIn .7s cubic-bezier(.2,.8,.2,1) ${0.08 + i * 0.11}s both` }
      : undefined

  const arcs: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    let h = (seed ^ Math.imul(i + 3, 0x9e3779b1)) >>> 0
    h = Math.imul(h, 2654435761) >>> 0
    const r = 40 - (i * 30) / Math.max(n, 1)
    const angle = h % 360
    const span = 46 + ((h >>> 6) % 108)
    arcs.push(
      <circle
        key={`a${i}`}
        cx="50" cy="50" r={r}
        pathLength={360}
        strokeDasharray={`${span} ${360 - span}`}
        transform={`rotate(${angle} 50 50)`}
        stroke={color} strokeWidth={1.5} opacity={0.9}
        style={inFx(i + 1)}
      />,
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }} aria-hidden>
      <circle cx="50" cy="50" r="46" stroke={color} strokeWidth="1.1" opacity={0.5} style={inFx(0)} />
      <rect
        x="38" y="38" width="24" height="24"
        transform={`rotate(${45 + leanIdx * 30} 50 50)`}
        stroke={color} strokeWidth="1.3" fill={color} fillOpacity={0.07}
        style={inFx(n + 1)}
      />
      {arcs}
      <circle cx="50" cy="50" r="2.8" fill="var(--ember)" style={inFx(n + 2)} />
    </svg>
  )
}
