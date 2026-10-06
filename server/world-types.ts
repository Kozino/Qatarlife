export type WorldRegionSlug = 'doha' | 'the-pearl' | 'lusail' | 'outside-doha'
export type OpeningStatus = 'open' | 'closed' | 'seasonal'

export interface InteractionPoint {
  id: string
  name: string
  type: 'activity' | 'shop' | 'social' | 'transport' | 'scenery'
  x: number
  y: number
}

export interface WorldDistrict {
  id: string
  slug: string
  name: string
  description: string
  regionSlug: WorldRegionSlug
  mapX: number
  mapY: number
  sortOrder: number
}

export interface WorldLocation {
  id: string
  slug: string
  name: string
  description: string
  districtId: string
  district: string
  regionSlug: WorldRegionSlug
  coordinates: { x: number; y: number }
  type: string
  openingStatus: OpeningStatus
  activities: string[]
  interactionPoints: InteractionPoint[]
}

export interface NearbyPlayer {
  id: string
  displayName: string
  x: number
  y: number
  status: 'online' | 'away' | 'offline'
}

export interface PlayerWorldState {
  location: WorldLocation
  x: number
  y: number
  isInside: boolean
  sequence: number
  nearbyPlayers: NearbyPlayer[]
}

export interface MoveInput {
  x: number
  y: number
  sequence: number
}
