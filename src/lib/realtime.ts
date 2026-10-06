import type { WorldRealtimeMessage } from '../types'

type RealtimeListener = (message: WorldRealtimeMessage | { type: 'connection'; status: 'connected' | 'reconnecting' | 'offline' }) => void

export class WorldRealtimeClient {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private closedByCaller = false
  private reconnectAttempt = 0
  private readonly listeners = new Set<RealtimeListener>()

  onMessage(listener: RealtimeListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect() {
    this.closedByCaller = false
    this.open()
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  send(payload: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload))
  }

  close() {
    this.closedByCaller = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
  }

  private open() {
    if (this.closedByCaller || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return
    const configuredUrl = import.meta.env.VITE_WS_URL as string | undefined
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const fallbackUrl = apiBaseUrl ? apiBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws/world' : `${protocol}//${window.location.host}/ws/world`
    this.socket = new WebSocket(configuredUrl || fallbackUrl)
    this.socket.onopen = () => {
      this.reconnectAttempt = 0
      this.emit({ type: 'connection', status: 'connected' })
    }
    this.socket.onmessage = (event) => {
      try { this.emit(JSON.parse(event.data) as WorldRealtimeMessage) } catch { /* Ignore malformed server messages. */ }
    }
    this.socket.onclose = () => {
      this.socket = null
      if (this.closedByCaller) return
      this.emit({ type: 'connection', status: 'reconnecting' })
      const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempt)
      this.reconnectAttempt += 1
      this.reconnectTimer = window.setTimeout(() => this.open(), delay)
    }
    this.socket.onerror = () => {
      this.emit({ type: 'connection', status: 'offline' })
    }
  }

  private emit(message: WorldRealtimeMessage | { type: 'connection'; status: 'connected' | 'reconnecting' | 'offline' }) {
    for (const listener of this.listeners) listener(message)
  }
}
