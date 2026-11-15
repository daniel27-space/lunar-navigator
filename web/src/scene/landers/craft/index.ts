// Which simplified model stands for a mission: its own where one has been made, otherwise the
// one for its class of craft.
import type { ReactNode } from 'react'
import { ApolloLM } from './apollo'
import { BlueGhost } from './blueghost'
import { ChangE5, ChangELander } from './change'
import { Impactor } from './impactor'
import { Luna9, LunaLander } from './luna'
import { Lunokhod } from './lunokhod'
import { NovaC } from './novac'
import { Slim } from './slim'
import { SmallLander } from './small'
import { Surveyor } from './surveyor'
import { Vikram } from './vikram'

export const ARCHETYPES = ['apollo-lm', 'surveyor', 'luna-lander', 'lunokhod', 'change-lander', 'small-lander', 'nova-c', 'impactor'] as const
export type Archetype = (typeof ARCHETYPES)[number]

const BY_CLASS: Record<Archetype, () => ReactNode> = {
  'apollo-lm': ApolloLM,
  surveyor: Surveyor,
  'luna-lander': LunaLander,
  lunokhod: Lunokhod,
  'change-lander': ChangELander,
  'small-lander': SmallLander,
  'nova-c': NovaC,
  impactor: Impactor,
}

/** Missions whose craft differs from the usual one of its class. Keys are mission ids (missions.json). */
const BY_MISSION: Record<string, () => ReactNode> = {
  'luna-9': Luna9,
  'luna-13': Luna9,
  'change-5': ChangE5,
  'change-6': ChangE5,
  'chandrayaan-3': Vikram,
  slim: Slim,
  'blue-ghost-m1': BlueGhost,
  'blue-ghost-m2': BlueGhost,
  'blue-ghost-m3': BlueGhost,
}

export function craftFor(missionId: string, archetype: Archetype): () => ReactNode {
  return BY_MISSION[missionId] ?? BY_CLASS[archetype]
}
