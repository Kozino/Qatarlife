import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { NearbyPlayer, PlayerWorldState, WorldLocation } from '../types'

type ThreeWorldSceneProps = {
  locations: WorldLocation[]
  world: PlayerWorldState
  nearbyPlayers: NearbyPlayer[]
  selectedLocationId: string | null
  onSelectLocation: (location: WorldLocation) => void
}

type DistrictAnchor = { x: number; y: number; color: string }

const districtAnchors: Record<string, DistrictAnchor> = {
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
  'Education City': { x: 23, y: 60, color: 'green' },
  'Aspire Park': { x: 31, y: 66, color: 'blue' },
  'Wakrah harbour': { x: 24, y: 86, color: 'rose' },
  'Al Khor mangroves': { x: 87, y: 60, color: 'green' },
  'Sealine dunes': { x: 39, y: 91, color: 'gold' },
}

const colorByDistrict: Record<string, number> = {
  rose: 0x8f3658,
  gold: 0xd6a958,
  blue: 0x4e8c96,
  green: 0x5f9476,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function scenePosition(location: WorldLocation, x = location.coordinates.x, y = location.coordinates.y) {
  const anchor = districtAnchors[location.district] || { x: 50, y: 50, color: 'gold' }
  return {
    x: (anchor.x - 50) * 0.34 + (x - 50) * 0.032,
    z: (anchor.y - 50) * 0.28 + (y - 50) * 0.032,
  }
}

function makeStandardMaterial(color: number, roughness = 0.82, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function addBox(parent: THREE.Object3D, position: THREE.Vector3, size: [number, number, number], color: number, options: { y?: number; roof?: boolean } = {}) {
  const [width, height, depth] = size
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeStandardMaterial(color))
  mesh.position.set(position.x, options.y ?? height / 2, position.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  if (options.roof) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, Math.min(width, depth) * 0.6, 4), makeStandardMaterial(0x9a6a49))
    roof.position.set(position.x, height + Math.min(width, depth) * 0.25, position.z)
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    parent.add(roof)
  }
  return mesh
}

function addPalm(parent: THREE.Object3D, x: number, z: number, scale = 1) {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.scale.setScalar(scale)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.5, 6), makeStandardMaterial(0x76513b))
  trunk.position.y = 0.75
  trunk.castShadow = true
  group.add(trunk)
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.38, 8), makeStandardMaterial(0x477b5b))
  crown.position.y = 1.58
  crown.rotation.x = Math.PI
  crown.castShadow = true
  group.add(crown)
  parent.add(group)
}

function addDhow(parent: THREE.Object3D, x: number, z: number) {
  const group = new THREE.Group()
  group.position.set(x, 0.08, z)
  group.rotation.y = -0.35
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 3), makeStandardMaterial(0x6b3546))
  hull.rotation.z = Math.PI / 2
  hull.scale.y = 0.48
  hull.castShadow = true
  group.add(hull)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 5), makeStandardMaterial(0x815d43))
  mast.position.set(0, 0.7, 0)
  group.add(mast)
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.72), new THREE.MeshStandardMaterial({ color: 0xf2e4c4, side: THREE.DoubleSide, roughness: 0.9 }))
  sail.position.set(0.18, 0.85, 0)
  sail.rotation.y = Math.PI / 2
  group.add(sail)
  parent.add(group)
}

function addRoad(parent: THREE.Object3D, points: Array<[number, number]>, color = 0xd7b985) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 0.035, z)))
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }))
  parent.add(line)
}

function addDistrictSet(parent: THREE.Object3D, district: string, anchor: DistrictAnchor) {
  const p = new THREE.Vector3((anchor.x - 50) * 0.34, 0, (anchor.y - 50) * 0.28)
  const accent = colorByDistrict[anchor.color] || colorByDistrict.gold
  const lower = district.toLowerCase()

  if (lower.includes('souq') || lower.includes('wakrah')) {
    for (let i = -1; i <= 1; i += 1) {
      addBox(parent, new THREE.Vector3(p.x + i * 0.8, 0, p.z), [0.55, 0.65, 0.8], 0xc58c59, { roof: true })
      addBox(parent, new THREE.Vector3(p.x + i * 0.8, 0, p.z + 0.75), [0.55, 0.7, 0.7], 0xb66f55, { roof: true })
    }
    addPalm(parent, p.x - 1.25, p.z + 0.25, 0.75)
    return
  }

  if (lower.includes('west bay') || lower.includes('lusail')) {
    for (let i = -1; i <= 1; i += 1) {
      addBox(parent, new THREE.Vector3(p.x + i * 0.65, 0, p.z), [0.42, 1.8 + Math.abs(i) * 0.35, 0.42], i === 0 ? accent : 0x7697a0)
    }
    addBox(parent, new THREE.Vector3(p.x + 1.15, 0, p.z + 0.35), [0.3, 1.1, 0.3], 0xc6a15e)
    return
  }

  if (lower.includes('desert') || lower.includes('sealine')) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), makeStandardMaterial(0xc99f68))
    dune.position.set(p.x, 0.02, p.z)
    dune.scale.set(1.45, 0.35, 0.75)
    dune.receiveShadow = true
    parent.add(dune)
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.85, 4), makeStandardMaterial(0x7b394e))
    tent.position.set(p.x + 0.75, 0.4, p.z + 0.35)
    tent.rotation.y = Math.PI / 4
    tent.castShadow = true
    parent.add(tent)
    return
  }

  if (lower.includes('mangrove') || lower.includes('beach') || lower.includes('corniche') || lower.includes('pearl')) {
    addPalm(parent, p.x - 0.65, p.z, 0.85)
    addPalm(parent, p.x + 0.8, p.z + 0.35, 0.68)
    addBox(parent, new THREE.Vector3(p.x, 0, p.z + 0.5), [1.5, 0.18, 0.55], 0xb47d52)
    return
  }

  if (lower.includes('education') || lower.includes('aspire') || lower.includes('katara')) {
    addBox(parent, new THREE.Vector3(p.x, 0, p.z), [1.15, 0.55, 0.85], 0xd7c5a6, { roof: true })
    addBox(parent, new THREE.Vector3(p.x + 0.9, 0, p.z + 0.25), [0.45, 0.9, 0.45], accent)
    addPalm(parent, p.x - 1.0, p.z + 0.45, 0.7)
    return
  }

  addBox(parent, new THREE.Vector3(p.x, 0, p.z), [0.9, 0.7, 0.75], 0xc8b18f, { roof: true })
  addPalm(parent, p.x + 0.9, p.z + 0.3, 0.62)
}

function createAvatar(color: number, ringColor: number) {
  const group = new THREE.Group()
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ color: 0x3c2430, transparent: true, opacity: 0.24 }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.015
  group.add(shadow)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.72, 7), makeStandardMaterial(color))
  body.position.y = 0.52
  body.castShadow = true
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), makeStandardMaterial(0xb8795e))
  head.position.y = 1.08
  head.castShadow = true
  group.add(head)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.8 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.045
  group.add(ring)
  return group
}

function createLabel(text: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(47, 13, 32, 0.78)'
  context.beginPath()
  context.roundRect(8, 18, canvas.width - 16, 92, 24)
  context.fill()
  context.fillStyle = color
  context.font = '600 34px Arial'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text.slice(0, 22), canvas.width / 2, canvas.height / 2 + 2)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }))
  sprite.scale.set(2.6, 0.65, 1)
  sprite.renderOrder = 20
  return sprite
}

export function ThreeWorldScene({ locations, world, nearbyPlayers, selectedLocationId, onSelectLocation }: ThreeWorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [webglFallback, setWebglFallback] = useState(false)
  const stateRef = useRef({ locations, world, nearbyPlayers, selectedLocationId })
  const callbackRef = useRef(onSelectLocation)
  const refreshRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    stateRef.current = { locations, world, nearbyPlayers, selectedLocationId }
    refreshRef.current?.()
  }, [locations, world, nearbyPlayers, selectedLocationId])

  useEffect(() => {
    callbackRef.current = onSelectLocation
  }, [onSelectLocation])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x9bbdc0)
    scene.fog = new THREE.Fog(0x9bbdc0, 20, 42)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(14, 15, 18)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      setWebglFallback(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'three-world-canvas'
    renderer.domElement.setAttribute('aria-label', 'Original Qatar Life 3D world')
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8
    controls.maxDistance = 28
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minPolarAngle = Math.PI * 0.18
    controls.enablePan = false

    scene.add(new THREE.HemisphereLight(0xfff1d4, 0x5e4050, 2.2))
    const sun = new THREE.DirectionalLight(0xffe3b0, 3.1)
    sun.position.set(-8, 18, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -22
    sun.shadow.camera.right = 22
    sun.shadow.camera.top = 22
    sun.shadow.camera.bottom = -22
    scene.add(sun)

    const worldRoot = new THREE.Group()
    scene.add(worldRoot)
    const clickable: THREE.Object3D[] = []
    const locationGroups = new Map<string, THREE.Group>()
    const locationById = new Map<string, WorldLocation>()
    const nearbyGroups = new Map<string, THREE.Group>()
    const currentPlayer = createAvatar(0x7c294f, 0xe1ba70)
    worldRoot.add(currentPlayer)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(42, 36), makeStandardMaterial(0xd1b485))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    worldRoot.add(ground)

    const water = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshStandardMaterial({ color: 0x5d9ba2, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.88 }))
    water.rotation.x = -Math.PI / 2
    water.scale.set(1.45, 0.64, 1)
    water.position.set(8.2, 0.035, -8.8)
    water.receiveShadow = true
    worldRoot.add(water)

    addRoad(worldRoot, [[-14, -1], [-7, -3], [0, -1], [8, -4], [15, -8]])
    addRoad(worldRoot, [[-13, 8], [-6, 5], [1, 6], [8, 4], [15, 1]], 0xc7a875)
    addRoad(worldRoot, [[-8, -14], [-5, -6], [-4, 2], [-1, 13]], 0xc7a875)
    addDhow(worldRoot, 8.2, -8.5)
    addPalm(worldRoot, 10.5, -5.7, 1.15)
    addPalm(worldRoot, 12.2, -6.7, 0.85)

    const districts = new Set<string>()
    for (const location of locations) {
      locationById.set(location.id, location)
      if (!districts.has(location.district)) {
        districts.add(location.district)
        const anchor = districtAnchors[location.district] || { x: 50, y: 50, color: 'gold' }
        addDistrictSet(worldRoot, location.district, anchor)
        const districtLabel = createLabel(location.district, '#f7e7c6')
        districtLabel.position.set((anchor.x - 50) * 0.34, 2.9, (anchor.y - 50) * 0.28)
        worldRoot.add(districtLabel)
      }

      const position = scenePosition(location)
      const anchor = districtAnchors[location.district] || { x: 50, y: 50, color: 'gold' }
      const marker = new THREE.Group()
      marker.position.set(position.x, 0, position.z)
      marker.userData.locationId = location.id
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.18, 8), makeStandardMaterial(colorByDistrict[anchor.color] || 0xd6a958))
      base.position.y = 0.12
      base.castShadow = true
      marker.add(base)
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0xffe6a9, emissive: 0x6d3b31, emissiveIntensity: 0.6, roughness: 0.42 }))
      beacon.position.y = 0.46
      beacon.castShadow = true
      marker.add(beacon)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.018, 6, 22), new THREE.MeshBasicMaterial({ color: 0xffefc3, transparent: true, opacity: 0.8 }))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.05
      marker.add(ring)
      const label = createLabel(location.name, '#f7e7c6')
      label.position.y = 1.2
      label.visible = false
      marker.add(label)
      worldRoot.add(marker)
      locationGroups.set(location.id, marker)
      clickable.push(marker)
    }

    const syncScene = () => {
      const current = stateRef.current
      for (const location of current.locations) {
        const marker = locationGroups.get(location.id)
        if (!marker) continue
        const selected = current.selectedLocationId === location.id
        marker.scale.setScalar(selected ? 1.28 : 1)
        const label = marker.children.find((child) => child instanceof THREE.Sprite) as THREE.Sprite | undefined
        if (label) label.visible = selected
      }

      const playerLocation = current.world.location
      const playerPosition = scenePosition(playerLocation, current.world.x, current.world.y)
      currentPlayer.position.set(playerPosition.x, 0, playerPosition.z)
      currentPlayer.rotation.y = Math.sin(Date.now() / 900) * 0.08

      for (const group of nearbyGroups.values()) worldRoot.remove(group)
      nearbyGroups.clear()
      for (const player of current.nearbyPlayers) {
        const playerPos = scenePosition(playerLocation, player.x, player.y)
        const avatar = createAvatar(0x4d7f92, 0xa7d2c6)
        avatar.position.set(playerPos.x, 0, playerPos.z)
        const label = createLabel(player.displayName, '#d9f1e5')
        label.position.y = 1.45
        avatar.add(label)
        worldRoot.add(avatar)
        nearbyGroups.set(player.id, avatar)
      }
    }
    refreshRef.current = syncScene
    syncScene()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onPointerUp = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(clickable, true)[0]
      if (!hit) return
      let object: THREE.Object3D | null = hit.object
      while (object && !object.userData.locationId) object = object.parent
      const locationId = object?.userData.locationId as string | undefined
      const location = locationId ? locationById.get(locationId) : undefined
      if (location) callbackRef.current(location)
    }
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    let frame = 0
    const animate = () => {
      frame = window.requestAnimationFrame(animate)
      controls.update()
      const pulse = 1 + Math.sin(Date.now() / 420) * 0.07
      currentPlayer.scale.setScalar(pulse)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frame)
      refreshRef.current = null
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
        if (object instanceof THREE.Sprite) object.material.map?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="three-world-shell">
    {webglFallback && <div className="three-world-webgl-fallback" role="status"><strong>3D view is unavailable on this device.</strong><span>Use the accessible place list below to explore Qatar Life.</span></div>}
    <div className="three-world-badge"><span className="three-world-orb" /><span><strong>Qatar Life · 3D world</strong><small>Drag to look · scroll to zoom · click a place</small></span></div>
    <div className="three-world-legend"><span><i className="legend-you" /> You</span><span><i className="legend-place" /> Place</span><span><i className="legend-player" /> Residents</span></div>
    <div className="three-world-accessible-list" aria-label="Qatar Life places text alternative"><strong>Places in this world</strong><ul>{locations.map((location) => <li key={location.id}><button type="button" onClick={() => callbackRef.current(location)}>{location.name} — {location.district}. {location.description}</button></li>)}</ul></div>
  </div>
}
