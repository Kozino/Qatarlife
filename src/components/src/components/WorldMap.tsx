import { Compass, MapPin, Waves } from 'lucide-react'
import type { RegionSlug } from '../types'

export type RegionOption = {
  id: RegionSlug
  name: string
  eyebrow: string
  description: string
  x: string
  y: string
}

export const regionOptions: RegionOption[] = [
  {
    id: 'doha',
    name: 'Doha',
    eyebrow: 'The city heart',
    description: 'Markets, museums, coastlines and the everyday rhythm of the city.',
    x: '30%',
    y: '39%',
  },
  {
    id: 'the-pearl',
    name: 'The Pearl',
    eyebrow: 'Marina days',
    description: 'Waterfront walks, restaurants, residences and soft evening light.',
    x: '62%',
    y: '28%',
  },
  {
    id: 'lusail',
    name: 'Lusail',
    eyebrow: 'A new horizon',
    description: 'Boulevards, stadium nights, entertainment and future-facing spaces.',
    x: '78%',
    y: '40%',
  },
  {
    id: 'outside-doha',
    name: 'Outside Doha',
    eyebrow: 'Open skies',
    description: 'Desert routes, shoreline escapes and slower discoveries beyond the city.',
    x: '48%',
    y: '74%',
  },
]

interface WorldMapProps {
  selectedRegion?: RegionSlug | null
  onSelect?: (region: RegionSlug) => void
  compact?: boolean
}

export function WorldMap({ selectedRegion = 'doha', onSelect, compact = false }: WorldMapProps) {
  return (
    <div className={`world-map ${compact ? 'world-map-compact' : ''}`}>
      <div className="map-wash map-wash-one" />
      <div className="map-wash map-wash-two" />
      <div className="map-topline">
        <span className="eyebrow eyebrow-light">
          <span className="status-dot" /> Fictional world preview
        </span>
        <span className="map-coordinate">25°17′ N · 51°32′ E</span>
      </div>
      <svg className="map-art" viewBox="0 0 800 520" role="img" aria-label="Abstract original map of Qatar Life regions">
        <path className="map-sea" d="M0 0h800v520H0z" />
        <path className="map-land" d="M161 16c62 15 122 19 190 13 46-4 78 5 108 25 30 20 65 33 91 61 25 26 32 57 27 87-4 29 10 48 37 65 33 21 62 47 66 86 3 30-10 58-37 77-29 21-81 35-126 44-75 15-151 14-235-3-73-15-129-39-162-75-32-36-48-89-38-141 9-48 30-75 58-105 26-28 22-55-3-82-16-18-14-42 24-52Z" />
        <path className="map-shadow" d="M187 54c39 17 84 24 126 21 41-3 83 2 113 24 35 25 52 57 83 76 35 22 78 39 88 77 9 34-13 57-4 85 10 34 52 55 47 92-4 28-35 47-73 59-68 22-141 27-215 18-79-9-138-32-178-73-39-41-52-94-40-141 10-40 37-64 48-98 10-34-22-57 5-89Z" />
        <path className="map-road" d="M161 225C280 181 404 204 507 255c75 37 101 80 121 143" />
        <path className="map-road map-road-thin" d="M217 90c43 106 50 202 13 318M370 53c14 91 11 174-1 257M546 117c-43 75-60 159-30 281" />
        <path className="map-route" d="M210 286C298 226 385 238 458 278s110 49 177 25" />
        <path className="map-route map-route-secondary" d="M271 393C343 338 405 330 496 350s122 20 165-19" />
        <circle className="map-water-ring" cx="671" cy="148" r="47" />
        <circle className="map-water-ring map-water-ring-small" cx="668" cy="148" r="27" />
        <path className="map-wave" d="M593 119c25-10 45-9 61 1s34 11 54 1" />
        <path className="map-wave" d="M603 134c20-8 37-8 51 0s29 9 45 1" />
      </svg>
      <div className="map-compass" aria-hidden="true">
        <Compass size={18} />
        <span>N</span>
      </div>
      {regionOptions.map((region) => {
        const active = selectedRegion === region.id
        return (
          <button
            key={region.id}
            className={`map-node ${active ? 'is-active' : ''}`}
            style={{ left: region.x, top: region.y }}
            onClick={() => onSelect?.(region.id)}
            type="button"
            aria-pressed={active}
          >
            <span className="map-node-dot">
              {region.id === 'outside-doha' ? <Waves size={13} /> : <MapPin size={13} />}
            </span>
            <span>{region.name}</span>
          </button>
        )
      })}
      {!compact && (
        <div className="map-legend">
          <span><i className="legend-line legend-line-route" /> travel route</span>
          <span><i className="legend-line legend-line-shore" /> coastline</span>
        </div>
      )}
    </div>
  )
}
