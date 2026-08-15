import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setAudioMuted as applyAudioMuted } from './components/audio'

export type Rank = 'Youngling' | 'Padawan' | 'Knight'

type SanctumState = {
  seenGate: boolean
  rank: Rank | null
  callsign: string | null
  trialsDone: string[]
  riteScores: Record<string, number>
  /* — Field Log era (v3) — */
  questsDone: string[]
  pathsWalked: string[]      // distinct choice paths, e.g. '0a'
  motesFound: string[]       // whisper motes caught in the Gate
  fragsCaught: number        // fragments restored (five total)
  transmissionsRead: boolean // witnessed the Gate's full transmission
  audioMuted: boolean
  /* — Master band (v4) — */
  masterBest: number         // highest master-band streak ever held
  /* — The Cover (v5) — */
  found: boolean             // has the visitor found the door behind the blog?
  visitor: string | null     // the name the network calls them by
  setSeenGate: (v: boolean) => void
  setIdentity: (rank: Rank, callsign: string) => void
  completeTrial: (id: string) => void
  setTrialScore: (id: string, score: number) => void
  sealQuests: (ids: string[]) => void
  walkPath: (key: string) => void
  findMote: (id: string) => void
  setFragsCaught: (n: number) => void
  setTransmissionsRead: () => void
  setAudioMuted: (v: boolean) => void
  setMasterBest: (n: number) => void
  setFound: (visitor: string) => void
  reset: () => void
}

/** The Sanctum remembers — progress persists in localStorage. */
export const useSanctum = create<SanctumState>()(
  persist(
    (set) => ({
      seenGate: false,
      rank: null,
      callsign: null,
      trialsDone: [],
      riteScores: {},
      questsDone: [],
      pathsWalked: [],
      motesFound: [],
      fragsCaught: 0,
      transmissionsRead: false,
      audioMuted: false,
      masterBest: 0,
      found: false,
      visitor: null,
      setSeenGate: (v) => set({ seenGate: v }),
      setIdentity: (rank, callsign) => set({ rank, callsign }),
      completeTrial: (id) => set((s) => ({ trialsDone: s.trialsDone.includes(id) ? s.trialsDone : [...s.trialsDone, id] })),
      setTrialScore: (id, score) => set((s) => ({ riteScores: { ...s.riteScores, [id]: score } })),
      sealQuests: (ids) => set((s) => ({ questsDone: [...new Set([...s.questsDone, ...ids])] })),
      walkPath: (key) => set((s) => ({ pathsWalked: s.pathsWalked.includes(key) ? s.pathsWalked : [...s.pathsWalked, key] })),
      findMote: (id) => set((s) => ({ motesFound: s.motesFound.includes(id) ? s.motesFound : [...s.motesFound, id] })),
      setFragsCaught: (n) => set((s) => ({ fragsCaught: Math.max(s.fragsCaught, n) })),
      setTransmissionsRead: () => set({ transmissionsRead: true }),
      setAudioMuted: (v) => {
        applyAudioMuted(v)
        set({ audioMuted: v })
      },
      setMasterBest: (n) => set((s) => ({ masterBest: Math.max(s.masterBest, n) })),
      setFound: (visitor) => set({ found: true, visitor }),
      reset: () => set({
        seenGate: false, rank: null, callsign: null, trialsDone: [], riteScores: {},
        questsDone: [], pathsWalked: [], motesFound: [], fragsCaught: 0,
        transmissionsRead: false, audioMuted: false, masterBest: 0,
        found: false, visitor: null,
      }),
    }),
    {
      name: 'sanctum-save-v1',
      version: 5,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SanctumState>
        return {
          ...s,
          riteScores: s.riteScores ?? {},
          questsDone: s.questsDone ?? [],
          pathsWalked: s.pathsWalked ?? [],
          motesFound: s.motesFound ?? [],
          fragsCaught: s.fragsCaught ?? 0,
          transmissionsRead: s.transmissionsRead ?? false,
          audioMuted: s.audioMuted ?? false,
          masterBest: s.masterBest ?? 0,
          found: s.found ?? false,
          visitor: s.visitor ?? null,
        }
      },
    },
  ),
)
