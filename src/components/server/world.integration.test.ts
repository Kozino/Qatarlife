import { describe, expect, it, afterAll } from 'vitest'
import request from 'supertest'
import WebSocket from 'ws'

process.env.NODE_ENV = 'test'

const { app, httpServer, worldRealtime } = await import('./index')

function emailFor(label: string) {
  return `${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
}

async function createPlayer(displayName: string, region = 'doha') {
  const agent = request.agent(app)
  const signup = await agent.post('/api/auth/signup').send({ email: emailFor(displayName.toLowerCase()), password: 'Story1234' })
  expect(signup.status).toBe(201)
  const onboarding = await agent.put('/api/onboarding').send({ displayName, startingRegion: region, presentation: 'modern-casual', skinTone: 'warm-sand', hairstyle: 'natural-short' })
  expect(onboarding.status).toBe(200)
  return { agent, user: signup.body.user, cookie: signup.headers['set-cookie']?.[0]?.split(';')[0] || '' }
}

describe('Phase 2 world HTTP and realtime behavior', () => {
  afterAll(async () => {
    worldRealtime.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('returns the seeded playable catalog and validates movement, entry and exit', async () => {
    const player = await createPlayer('Atlas')
    const catalog = await player.agent.get('/api/world/locations')
    expect(catalog.status).toBe(200)
    expect(catalog.body.locations.length).toBeGreaterThanOrEqual(20)
    expect(new Set(catalog.body.locations.map((location: { district: string }) => location.district))).toEqual(new Set(['Doha', 'Souq district', 'Corniche', 'Msheireb', 'West Bay', 'Katara', 'The Pearl', 'Lusail', 'Desert', 'Beach', 'Education City', 'Aspire Park', 'Wakrah harbour', 'Al Khor mangroves', 'Sealine dunes']))

    const initial = await player.agent.get('/api/world/state')
    expect(initial.status).toBe(200)
    expect(initial.body.state.location.name).toBeTruthy()

    const move = await player.agent.post('/api/world/move').send({ x: initial.body.state.x + 3, y: initial.body.state.y, sequence: initial.body.state.sequence + 1 })
    expect(move.status).toBe(200)

    const teleport = await player.agent.post('/api/world/move').send({ x: 95, y: 95, sequence: move.body.state.sequence + 1 })
    expect(teleport.status).toBe(400)
    expect(teleport.body.error.code).toBe('MOVE_TOO_FAR')

    const enter = await player.agent.post('/api/world/enter').send({ locationId: 'souq-lantern-lane' })
    expect(enter.status).toBe(200)
    expect(enter.body.state.isInside).toBe(true)
    expect(enter.body.state.location.id).toBe('souq-lantern-lane')

    const exit = await player.agent.post('/api/world/exit')
    expect(exit.status).toBe(200)
    expect(exit.body.state.isInside).toBe(false)
  })

  it('returns only players in the same location', async () => {
    const first = await createPlayer('First Player')
    const second = await createPlayer('Second Player')
    await first.agent.post('/api/world/enter').send({ locationId: 'corniche-waterfront' })
    await second.agent.post('/api/world/enter').send({ locationId: 'corniche-waterfront' })
    const nearby = await second.agent.get('/api/world/nearby')
    expect(nearby.status).toBe(200)
    expect(nearby.body.players.some((player: { displayName: string }) => player.displayName === 'First Player')).toBe(true)
  })

  it('authenticates realtime presence and preserves state after reconnect', async () => {
    const player = await createPlayer('Realtime Player')
    const port = (httpServer.address() as { port: number } | null)?.port || 0
    if (!port) await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()))
    const actualPort = (httpServer.address() as { port: number }).port
    const url = `ws://127.0.0.1:${actualPort}/ws/world`

    const firstSocket = new WebSocket(url, { headers: { Cookie: player.cookie } })
    const ready = await waitForMessage(firstSocket, 'world:ready')
    expect(ready.state.location).toBeTruthy()
    firstSocket.send(JSON.stringify({ type: 'world:enter', locationId: 'corniche-waterfront' }))
    const entered = await waitForMessage(firstSocket, 'world:state')
    expect(entered.state.isInside).toBe(true)
    firstSocket.send(JSON.stringify({ type: 'world:move', x: entered.state.x + 2, y: entered.state.y, sequence: entered.state.sequence + 1 }))
    const moved = await waitForMessage(firstSocket, 'world:move_ack')
    expect(moved.state.x).toBe(entered.state.x + 2)
    firstSocket.close()
    await waitForClose(firstSocket)

    const reconnected = new WebSocket(url, { headers: { Cookie: player.cookie } })
    const readyAgain = await waitForMessage(reconnected, 'world:ready')
    expect(readyAgain.state.x).toBe(moved.state.x)
    expect(readyAgain.state.isInside).toBe(true)
    reconnected.close()
    await waitForClose(reconnected)
  })
})

function waitForMessage(socket: WebSocket, type: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 4000)
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as { type: string }
      if (message.type !== type) return
      clearTimeout(timeout)
      socket.off('message', onMessage)
      resolve(message)
    }
    socket.on('message', onMessage)
    socket.on('error', reject)
  })
}

function waitForClose(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise<void>((resolve) => socket.once('close', () => resolve()))
}
