import type { WorldLocation } from './world-types'

export interface WorldLocationRow {
  id: string
  slug: string
  name: string
  description: string
  district_id: string
  district: string
  region_slug: 'doha' | 'the-pearl' | 'lusail' | 'outside-doha'
  location_type: string
  coordinates: unknown
  opening_status: 'open' | 'closed' | 'seasonal'
  activities: unknown
  interaction_points: unknown
}

export function parseJsonObject(value: unknown, fallback: Record<string, number>) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, number> } catch { return fallback }
  }
  if (value && typeof value === 'object') return value as Record<string, number>
  return fallback
}

export function parseJsonArray<T>(value: unknown, fallback: T[] = []) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T[] } catch { return fallback }
  }
  return Array.isArray(value) ? value as T[] : fallback
}

export function mapWorldLocation(row: WorldLocationRow): WorldLocation {
  const coordinates = parseJsonObject(row.coordinates, { x: 50, y: 50 })
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    districtId: row.district_id,
    district: row.district,
    regionSlug: row.region_slug,
    coordinates: { x: Number(coordinates.x ?? 50), y: Number(coordinates.y ?? 50) },
    type: row.location_type,
    openingStatus: row.opening_status,
    activities: parseJsonArray<string>(row.activities),
    interactionPoints: parseJsonArray(row.interaction_points),
  }
}
