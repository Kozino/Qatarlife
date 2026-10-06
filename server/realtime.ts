import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { logger } from './logger'
import { config } from './config'
import { hashOpaqueToken, sessionCookieName } from './security'
import type { AccountStore } from './db'
import { WorldValidationError } from './world-rules'
import type { NearbyPlayer, PlayerWorldState } from './world-types'

type Client = {
  socket: WebSocket
  userId: string
  displayName: string
  locationId: string
  x: number
  y: number
  messagesAt: number
  messageCount: number
}

type ClientMessage = {
  type?: string
  locationId?: string
  x?: number
  y?: number
  sequence?: number
}

export class WorldRealtime {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 })
  private readonly clients = new Map<WebSocket, Client>()

  constructor(private readonly server: HttpServer, private readonly store: AccountStore) {
    this.server.on('upgrade', this.handleUpgrade)
    this.wss.on('connection', this.handleConnection)
  }

  private readonly handleUpgrade = async (request: IncomingMessage, socket: NodeJS.WritableStream, head: Buffer) => {
    const url = new URL(request.url || '/', 'http://qatar-life.local')
    if (url.pathname !== '/ws/world') {
      socket.end()
      return
    }
    const requestOrigin = request.headers.origin
    if (requestOrigin && !config.corsOrigins.some((origin) => normalizeOrigin(origin) === normalizeOrigin(requestOrigin))) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.end()
      return
    }
    const rawToken = readCookie(request.headers.cookie, sessionCookieName)
    const userId = rawToken ? await this.store.getUserIdBySessionHash(hashOpaqueToken(rawToken)) : null
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.end()
      return
    }
    this.wss.handleUpgrade(request, socket as never, head, (ws) => {
      this.wss.emit('connection', ws, request, userId)
    })
  }

  private readonly handleConnection = async (socket: WebSocket, _request: IncomingMessage, userId: string) => {
    const user = await this.store.getBundleByUserId(userId)
    const state = await this.store.getWorldState(userId)
    if (!user || !state) {
      socket.close(1008, 'World state unavailable')
      return
    }
    const client: Client = {
      socket,
      userId,
      displayName: user.profile.displayName || 'Resident',
      locationId: state.location.id,
      x: state.x,
      y: state.y,
      messagesAt: Date.now(),
      messageCount: 0,
    }
    this.clients.set(socket, client)
    this.send(socket, { type: 'world:ready', state })
    this.broadcastPresence(client.locationId)

    socket.on('message', (raw) => void this.handleMessage(client, raw.toString()))
    socket.on('close', () => {
      this.clients.delete(socket)
      // A network disconnect removes the transient presence only; it must not
      // turn a durable inside/outside world state into an implicit exit.
      this.broadcastPresence(client.locationId)
    })
    socket.on('error', (error) => logger.warn('world_socket_error', { userId, error: error.message }))
  }

  private async handleMessage(client: Client, raw: string) {
    if (!this.allowMessage(client)) {
      this.send(client.socket, { type: 'world:error', code: 'RATE_LIMITED', message: 'World updates are arriving too quickly.' })
      return
    }
    let message: ClientMessage
    try {
      message = JSON.parse(raw) as ClientMessage
    } catch {
      this.send(client.socket, { type: 'world:error', code: 'INVALID_MESSAGE', message: 'That realtime message is invalid.' })
      return
    }

    try {
      if (message.type === 'world:move' && typeof message.x === 'number' && typeof message.y === 'number' && typeof message.sequence === 'number') {
        const state = await this.store.movePlayer(client.userId, { x: message.x, y: message.y, sequence: message.sequence })
        if (!state) return this.send(client.socket, { type: 'world:error', code: 'WORLD_STATE_NOT_FOUND', message: 'World state is unavailable.' })
        client.locationId = state.location.id
        client.x = state.x
        client.y = state.y
        this.send(client.socket, { type: 'world:move_ack', state: withoutNearby(state) })
        this.broadcastPresence(client.locationId)
        return
      }
      if (message.type === 'world:enter' && typeof message.locationId === 'string') {
        const previousLocationId = client.locationId
        const state = await this.store.enterLocation(client.userId, message.locationId)
        if (!state) return this.send(client.socket, { type: 'world:error', code: 'LOCATION_NOT_FOUND', message: 'That location could not be found.' })
        client.locationId = state.location.id
        client.x = state.x
        client.y = state.y
        this.send(client.socket, { type: 'world:state', state })
        if (previousLocationId !== client.locationId) this.broadcastPresence(previousLocationId)
        this.broadcastPresence(client.locationId)
        return
      }
      if (message.type === 'world:exit') {
        const state = await this.store.exitLocation(client.userId)
        if (!state) return this.send(client.socket, { type: 'world:error', code: 'WORLD_STATE_NOT_FOUND', message: 'World state is unavailable.' })
        this.send(client.socket, { type: 'world:state', state })
        this.broadcastPresence(client.locationId)
        return
      }
      if (message.type === 'world:ping') {
        this.send(client.socket, { type: 'world:pong', at: Date.now() })
        return
      }
      this.send(client.socket, { type: 'world:error', code: 'INVALID_MESSAGE', message: 'That realtime message is not supported.' })
    } catch (error) {
      if (error instanceof WorldValidationError) {
        this.send(client.socket, { type: 'world:error', code: error.code, message: error.message })
        return
      }
      logger.error('world_socket_message_failed', { userId: client.userId, error: error instanceof Error ? error.message : String(error) })
      this.send(client.socket, { type: 'world:error', code: 'WORLD_ERROR', message: 'The world could not apply that update.' })
    }
  }

  private broadcastPresence(locationId: string) {
    const locationClients = [...this.clients.values()].filter((client) => client.locationId === locationId && client.socket.readyState === WebSocket.OPEN)
    for (const receiver of locationClients) {
      const players: NearbyPlayer[] = locationClients
        .filter((client) => client.userId !== receiver.userId)
        .map((client) => ({ id: client.userId, displayName: client.displayName, x: client.x, y: client.y, status: 'online' }))
      // The next movement acknowledgment updates the moving player’s coordinates; this snapshot is deliberately room-scoped.
      this.send(receiver.socket, { type: 'presence:snapshot', locationId, players })
    }
  }

  private allowMessage(client: Client) {
    const now = Date.now()
    if (now - client.messagesAt > 1000) {
      client.messagesAt = now
      client.messageCount = 0
    }
    client.messageCount += 1
    return client.messageCount <= 40
  }

  private send(socket: WebSocket, payload: unknown) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  }

  close() {
    for (const client of this.clients.values()) client.socket.close(1001, 'World server shutting down')
    this.wss.close()
    this.server.off('upgrade', this.handleUpgrade)
  }
}

function withoutNearby(state: PlayerWorldState) {
  return { location: state.location, x: state.x, y: state.y, isInside: state.isInside, sequence: state.sequence, nearbyPlayers: [] }
}

function normalizeOrigin(value: string) {
  try { return new URL(value).origin } catch { return value.replace(/\/$/, '') }
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return null
  const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  if (!pair) return null
  try { return decodeURIComponent(pair.slice(name.length + 1)) } catch { return null }
}
