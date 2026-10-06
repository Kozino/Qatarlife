import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, DoorOpen, Footprints, LocateFixed, MapPin, RefreshCw, UsersRound, Wifi, WifiOff, X } from 'lucide-react'
import { api } from '../lib/api'
import { WorldRealtimeClient } from '../lib/realtime'
import type { NearbyPlayer, PlayerWorldState, UserBundle, WorldLocation } from '../types'

const districtAnchors: Record<string, { x: number; y: number; color: string }> = {
  Doha: { x: 31, y: 38, color: 'rose' },
  'Souq district': { x: 22, y: 25, color: 'gold' },
  Corniche: { x: 41, y: 29, color: 'blue' },
  Msheireb: { x: 34, y: 47, color: 'green' },
  'West Bay': { x: 49, y: 22, color: 'blue' },
  Katara: { x: 58, y: 31, color: 'gold' },
  'The Pearl': { x: 70, y: 24, color: 'green' },
  Lusail: { x: 80, y: 34, color: 'rose' },
  Desert: { x: 50, y: 76, color: 'gold' },
  Beach: { x: 72, y: 76, color: 'blue' },
}

const clamp = (value: number) => Math.max(5, Math.min(95, value))

function globalPosition(location: WorldLocation, x = location.coordinates.x, y = location.coordinates.y) {
  const anchor = districtAnchors[location.district] || districtAnchors.Doha
  return {
    x: clamp(anchor.x + (x - 50) * 0.18),
    y: clamp(anchor.y + (y - 50) * 0.18),
  }
}

type PlayableWorldProps = { user: UserBundle; onOpenPassport: () => void }

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export function PlayableWorld({ user, onOpenPassport }: PlayableWorldProps) {
  const [locations, setLocations] = useState<WorldLocation[]>([])
  const [world, setWorld] = useState<PlayerWorldState | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<WorldLocation | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const worldRef = useRef<PlayerWorldState | null>(null)
  const sequenceRef = useRef(0)
  const realtimeRef = useRef<WorldRealtimeClient | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.worldLocations(), api.worldState()])
      .then(([catalog, state]) => {
        if (cancelled) return
        setLocations(catalog.locations)
        if (!worldRef.current) {
          setWorld(state.state)
          setSelectedLocation(state.state.location)
          worldRef.current = state.state
          sequenceRef.current = state.state.sequence
        }
      })
      .catch((caught) => setError((caught as Error).message || 'The world could not be loaded.'))
      .finally(() => setLoading(false))

    const realtime = new WorldRealtimeClient()
    realtimeRef.current = realtime
    const unsubscribe = realtime.onMessage((message) => {
      if (message.type === 'connection') {
        setConnection(message.status === 'connected' ? 'connected' : message.status)
        return
      }
      if (message.type === 'world:ready' || message.type === 'world:state' || message.type === 'world:move_ack') {
        setWorldState(message.state)
        setSelectedLocation(message.state.location)
        return
      }
      if (message.type === 'presence:snapshot') {
        setWorld((current) => current ? { ...current, nearbyPlayers: message.players } : current)
        if (worldRef.current) worldRef.current = { ...worldRef.current, nearbyPlayers: message.players }
        return
      }
      if (message.type === 'world:error') {
        setError(message.message)
      }
    })
    realtime.connect()
    return () => {
      cancelled = true
      unsubscribe()
      realtime.close()
      realtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyDirection(event.key)
      if (!direction) return
      event.preventDefault()
      void move(direction.x, direction.y)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const districts = useMemo(() => {
    const unique = new Map<string, WorldLocation>()
    for (const location of locations) if (!unique.has(location.district)) unique.set(location.district, location)
    return [...unique.values()]
  }, [locations])

  function setWorldState(next: PlayerWorldState) {
    worldRef.current = next
    sequenceRef.current = next.sequence
    setWorld(next)
    setError('')
  }

  async function move(dx: number, dy: number) {
    const current = worldRef.current
    if (!current || busy) return
    const step = 3.5
    const next = { x: clamp(current.x + dx * step), y: clamp(current.y + dy * step), sequence: sequenceRef.current + 1 }
    sequenceRef.current = next.sequence
    if (realtimeRef.current?.isConnected()) {
      realtimeRef.current.send({ type: 'world:move', ...next })
      return
    }
    try {
      setBusy(true)
      const result = await api.movePlayer(next)
      setWorldState(result.state)
    } catch (caught) {
      sequenceRef.current = current.sequence
      setError((caught as Error).message || 'Movement was rejected by the server.')
    } finally {
      setBusy(false)
    }
  }

  async function enterLocation(location: WorldLocation) {
    setBusy(true)
    setError('')
    try {
      if (realtimeRef.current?.isConnected()) {
        realtimeRef.current.send({ type: 'world:enter', locationId: location.id })
      } else {
        const result = await api.enterLocation(location.id)
        setWorldState(result.state)
      }
    } catch (caught) {
      setError((caught as Error).message || 'That location could not be entered.')
    } finally {
      setBusy(false)
    }
  }

  async function exitLocation() {
    setBusy(true)
    try {
      if (realtimeRef.current?.isConnected()) realtimeRef.current.send({ type: 'world:exit' })
      else setWorldState((await api.exitLocation()).state)
    } catch (caught) {
      setError((caught as Error).message || 'You could not exit that location.')
    } finally {
      setBusy(false)
    }
  }

  const currentLocation = world?.location
  const currentGlobal = currentLocation && world ? globalPosition(currentLocation, world.x, world.y) : { x: 50, y: 50 }
  const otherPlayers: NearbyPlayer[] = world?.nearbyPlayers || []

  if (loading) return <div className="world-loading page-card"><RefreshCw size={18} className="spin" /><span>Loading your world state…</span></div>
  if (!world) return <div className="world-error page-card"><MapPin size={19} /><h2>World unavailable</h2><p>{error || 'We could not load your location.'}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Try again</button></div>

  return <section className="playable-world-layout">
    <div className="playable-world-header"><div><span className="eyebrow">Chapter one · live world</span><h1>Find your way around.</h1><p>Move through a fictional Qatar-inspired world. Nearby players are scoped to your current area.</p></div><div className="world-header-actions"><span className={`world-connection ${connection}`}><span className="status-dot" />{connection === 'connected' ? 'Realtime connected' : connection === 'reconnecting' ? 'Reconnecting…' : connection === 'offline' ? 'Offline mode' : 'Connecting…'}</span><button className="passport-quick-button" type="button" onClick={onOpenPassport}><span className="quick-seal"><MapPin size={14} /></span><span><small>QATAR LIFE PASSPORT</small><strong>Open your progress</strong></span></button></div></div>
    <div className="playable-world-grid">
      <div className="playable-stage-card page-card">
        <div className="playable-stage-top"><span className="stage-location"><MapPin size={14} /><strong>{currentLocation?.name}</strong><span>· {currentLocation?.district}</span></span><span className="stage-mode"><Wifi size={13} /> room presence</span></div>
        <div className="playable-stage" aria-label="Original stylized playable Qatar Life world map">
          <div className="stage-skyline skyline-a" /><div className="stage-skyline skyline-b" /><div className="stage-road road-a" /><div className="stage-road road-b" /><div className="stage-water" />
          {districts.map((location) => { const anchor = districtAnchors[location.district] || districtAnchors.Doha; return <button key={location.district} className={`district-marker district-marker-${anchor.color} ${currentLocation?.district === location.district ? 'is-current' : ''}`} style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }} type="button" onClick={() => { setSelectedLocation(location); void enterLocation(location) }}><span className="district-marker-dot" /><span>{location.district}</span></button> })}
          {locations.map((location) => { const pos = globalPosition(location); return <button key={location.id} className={`location-marker ${selectedLocation?.id === location.id ? 'is-selected' : ''}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} type="button" onClick={() => setSelectedLocation(location)} aria-label={`Select ${location.name}`}><span /></button> })}
          {otherPlayers.map((player) => { const pos = currentLocation ? globalPosition(currentLocation, player.x, player.y) : { x: 50, y: 50 }; return <div key={player.id} className="nearby-player-marker" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}><span className="nearby-player-avatar">{player.displayName.slice(0, 2).toUpperCase()}</span><span className="nearby-player-label">{player.displayName}</span></div> })}
          <div className="current-player-marker" style={{ left: `${currentGlobal.x}%`, top: `${currentGlobal.y}%` }}><span className="current-player-pulse" /><span className="current-player-avatar">{user.profile.displayName?.slice(0, 2).toUpperCase() || 'ME'}</span><span className="current-player-label">You · {user.profile.displayName || 'Resident'}</span></div>
          <div className="stage-compass"><LocateFixed size={14} /><span>N</span></div><div className="stage-scale"><i /> 100 virtual steps</div>
        </div>
        <div className="playable-stage-footer"><span><Footprints size={14} /> Desktop: use WASD or arrow keys</span><span><Circle size={8} fill="currentColor" /> Mobile: use the directional pad</span></div>
      </div>
      <aside className="world-side-panel">
        <div className="world-control-card page-card"><div className="world-control-head"><span className="eyebrow">Your movement</span><span className={world.isInside ? 'inside-pill' : 'outside-pill'}>{world.isInside ? <><DoorOpen size={12} /> inside</> : <><Footprints size={12} /> outside</>}</span></div><div className="d-pad" aria-label="Movement controls"><button type="button" onClick={() => void move(0, -1)} aria-label="Move up"><ArrowUp size={17} /></button><div><button type="button" onClick={() => void move(-1, 0)} aria-label="Move left"><ArrowLeft size={17} /></button><span className="d-pad-center">{busy ? <RefreshCw size={12} className="spin" /> : <Circle size={8} fill="currentColor" />}</span><button type="button" onClick={() => void move(1, 0)} aria-label="Move right"><ArrowRight size={17} /></button></div><button type="button" onClick={() => void move(0, 1)} aria-label="Move down"><ArrowDown size={17} /></button></div><span className="movement-position">x {Math.round(world.x)} · y {Math.round(world.y)} · update {world.sequence}</span></div>
        {selectedLocation && <div className="location-detail-card page-card"><div className="location-detail-top"><span className="eyebrow">Selected location</span><button className="icon-button" type="button" onClick={() => setSelectedLocation(null)} aria-label="Close location details"><X size={15} /></button></div><h2>{selectedLocation.name}</h2><span className="location-district-label"><MapPin size={12} /> {selectedLocation.district} · {selectedLocation.openingStatus}</span><p>{selectedLocation.description}</p><div className="activity-tag-list">{selectedLocation.activities.slice(0, 4).map((activity) => <span key={activity}>{activity}</span>)}</div><div className="interaction-list"><span className="eyebrow">Interaction prompts</span>{selectedLocation.interactionPoints.map((point) => <div key={point.id}><span className="interaction-dot" /><span>{point.name}</span><small>{point.type}</small></div>)}</div>{currentLocation?.id === selectedLocation.id && world.isInside ? <button className="outline-button world-action-button" type="button" onClick={() => void exitLocation()} disabled={busy}><DoorOpen size={14} /> Exit location</button> : <button className="primary-button world-action-button" type="button" onClick={() => void enterLocation(selectedLocation)} disabled={busy || selectedLocation.openingStatus === 'closed'}><DoorOpen size={14} /> {selectedLocation.openingStatus === 'seasonal' ? 'Enter seasonal location' : 'Enter location'}</button>}</div>}
        <div className="nearby-card page-card"><div className="world-control-head"><span className="eyebrow"><UsersRound size={13} /> Nearby players</span><span className="nearby-count">{otherPlayers.length}</span></div>{otherPlayers.length ? <div className="nearby-list">{otherPlayers.map((player) => <div key={player.id} className="nearby-row"><span className="nearby-mini-avatar">{player.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{player.displayName}</strong><small><span className="status-dot" /> {player.status}</small></span></div>)}</div> : <div className="nearby-empty"><UsersRound size={17} /><p>No one else is in this room yet.<br /><strong>Use Friends to connect with another resident.</strong></p></div>}</div>
      </aside>
    </div>
    {error && <div className="world-inline-alert" role="alert">{connection === 'offline' ? <WifiOff size={15} /> : <Wifi size={15} />}{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={13} /></button></div>}
  </section>
}

function keyDirection(key: string) {
  if (key === 'ArrowUp' || key.toLowerCase() === 'w') return { x: 0, y: -1 }
  if (key === 'ArrowDown' || key.toLowerCase() === 's') return { x: 0, y: 1 }
  if (key === 'ArrowLeft' || key.toLowerCase() === 'a') return { x: -1, y: 0 }
  if (key === 'ArrowRight' || key.toLowerCase() === 'd') return { x: 1, y: 0 }
  return null
}
