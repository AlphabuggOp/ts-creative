import { create } from 'zustand'
import { useSanctum } from '../store'
import { chime } from '../components/audio'

/* ── THE QUEST ENGINE ─────────────────────────────────────────────
   One door: rites, the Gate and the Field Log itself all fire
   questEvent(...); every unsealed quest re-checks against the fresh
   store snapshot; newly sealed quests persist + sing on the toast
   rail.                                                            */

export type QuestEvent = {
  type: 'rite-clear' | 'rite-replay' | 'signal-lock' | 'focus-wave' | 'pole' | 'paths' | 'motes' | 'read' | 'frags' | 'panic' | 'master' | 'decoy-clear' | 'anointed' | 'departed'
  id?: string
  score?: number
  secs?: number
  frac?: number
  pole?: number
}

type QS = ReturnType<typeof useSanctum.getState>

export type Quest = {
  id: string
  name: string
  hint: string
  progress?: (s: QS) => string | undefined
  check: (s: QS, e?: QuestEvent) => boolean
}

export const QUESTS: Quest[] = [
  { id: 'q-clear-signal', name: 'FIRST SONG RESTORED', hint: 'Clear the Trial of Signal.', check: (s) => s.trialsDone.includes('signal') },
  { id: 'q-clear-focus', name: 'THE STEADY HAND', hint: 'Clear the Trial of Focus.', check: (s) => s.trialsDone.includes('focus') },
  { id: 'q-clear-choice', name: 'A MIND MADE VISIBLE', hint: 'Clear the Trial of Choice.', check: (s) => s.trialsDone.includes('choice') },
  { id: 'q-echo-signal', name: 'ACUTE EARS', hint: 'Finish Signal with RANK ECHO 2 or better.', check: (s) => (s.riteScores.signal ?? 0) >= 2 },
  { id: 'q-echo-focus', name: 'STONE STILL', hint: 'Finish Focus with RANK ECHO 2 or better.', check: (s) => (s.riteScores.focus ?? 0) >= 2 },
  { id: 'q-echo-choice', name: 'MARKED CONVICTION', hint: 'Finish Choice with RANK ECHO 2 or better.', check: (s) => (s.riteScores.choice ?? 0) >= 2 },
  { id: 'q-speedlock', name: 'QUICK DIAL', hint: 'Lock a fragment in under eight seconds.', check: (_s, e) => e?.type === 'signal-lock' && (e.secs ?? 99) < 8 },
  { id: 'q-flawless', name: 'NOT A TREMBLE', hint: 'Hold a whole focus wave at 98% or better.', check: (_s, e) => e?.type === 'focus-wave' && (e.frac ?? 0) >= 0.98 },
  { id: 'q-consistent', name: 'ONE STRAIGHT LINE', hint: 'Render all three judgments on a single pole.', check: (_s, e) => e?.type === 'pole' && Math.abs(e.pole ?? 0) === 3 },
  { id: 'q-replay', name: 'THE ORBIT REMEMBERS', hint: 'Re-enter a rite you have already cleared.', check: (_s, e) => e?.type === 'rite-replay' },
  { id: 'q-frags5', name: 'THE WHOLE MESSAGE', hint: 'Catch all five fragments of the transmission.', progress: (s) => `${Math.min(s.fragsCaught, 5)}/5`, check: (s) => s.fragsCaught >= 5 },
  { id: 'q-read', name: 'READ EVERYTHING', hint: 'Witness the Gate’s transmission to its end.', check: (s) => s.transmissionsRead },
  {
    id: 'q-motes', name: 'THE WHISPERS', hint: 'Catch the three whispers hidden in the Gate journey.',
    progress: (s) => `${s.motesFound.length}/3`, check: (s) => s.motesFound.length >= 3,
  },
  {
    id: 'q-paths6', name: 'BOTH SIDES OF TOMORROW', hint: 'Walk all six paths — replay dilemmas and choose otherwise.',
    progress: (s) => `${s.pathsWalked.length}/6`, check: (s) => s.pathsWalked.length >= 6,
  },
  { id: 'q-panic', name: 'GHOST PROTOCOL', hint: 'Learn the panic key.', check: (_s, e) => e?.type === 'panic' },
  {
    id: 'q-master5', name: 'THE LADDER HOLDS', hint: 'Run the master band to a ×5 streak.',
    progress: (s) => `BEST ×${s.masterBest}`, check: (s) => s.masterBest >= 5,
  },
  { id: 'q-notfooled', name: 'NOT FOOLED', hint: 'Survive the doubles wave without feeding the lie.', check: (_s, e) => e?.type === 'decoy-clear' },
  { id: 'q-anointed', name: 'THE NAME THE STARS CALL YOU', hint: 'Present yourself at the Ceremony and receive your mark.', check: (s) => !!s.callsign },
  { id: 'q-departed', name: 'THE DOOR CLOSES BEHIND YOU', hint: 'Walk the Departure to its very end.', check: (_s, e) => e?.type === 'departed' },
]

/* toast rail — volatile, not persisted */
type Toast = { id: number; title: string; sub?: string }
let toastSeq = 0
export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id: ++toastSeq }] })),
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** the single door every game system knocks on */
export function questEvent(e?: QuestEvent) {
  const s = useSanctum.getState()
  const newly: Quest[] = []
  for (const q of QUESTS) {
    if (s.questsDone.includes(q.id)) continue
    let ok = false
    try { ok = q.check(s, e) } catch { ok = false }
    if (ok) newly.push(q)
  }
  if (!newly.length) return
  s.sealQuests(newly.map((q) => q.id))
  newly.forEach((q, i) => {
    setTimeout(() => {
      useToasts.getState().push({ title: `QUEST SEALED — ${q.name}`, sub: q.hint })
      chime(987.77, 0.9, 0.07)
      setTimeout(() => chime(1318.5, 1.2, 0.05), 120)
    }, i * 420)
  })
}

/* the network answers direct knocks from the console too */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __quest?: unknown }).__quest = questEvent
}
