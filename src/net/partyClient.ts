import { ClientMsg, ServerMsg } from './protocol';
import type { Color } from '../core/types';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface ClientCallbacks {
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: ConnectionStatus) => void;
}

/**
 * Information needed to re-join the same room after a transient
 * disconnect. The client remembers the room code + display name + its
 * assigned color so that on a successful reconnect we can replay the
 * JOIN automatically; the server treats this as the original player
 * resuming the seat (it slots them back into BLACK/WHITE based on
 * `connected` flags and assigns the previous color when free).
 */
interface RejoinInfo {
  room: string;
  name: string;
  asColor?: Color | 'SPECTATE';
}

export class PartyClient {
  private ws: WebSocket | null = null;
  private reconnectTries = 0;
  private url: string;
  private cb: ClientCallbacks;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private onceOpen: Array<() => void> = [];
  private rejoin: RejoinInfo | null = null;

  constructor(url: string, cb: ClientCallbacks) {
    this.url = url;
    this.cb = cb;
  }

  /** Resolves the next time the socket opens. Useful for "send on connect" flows. */
  whenOpen(handler: () => void) {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      handler();
      return;
    }
    this.onceOpen.push(handler);
  }

  connect() {
    this.intentionalClose = false;
    this.cb.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.cb.onStatus('open');
      this.reconnectTries = 0;
      this.pingTimer = setInterval(() => {
        this.send({ t: 'PING' });
      }, 25_000);
      // If we know which room to re-join (set after a successful CREATE
      // or JOIN handshake), replay the JOIN here so the server links
      // this fresh socket back to our original player slot. Without
      // this, server-side `joinedCode` stays null and any later BID /
      // PLACE / CHAT message comes back as ROOM_NOT_FOUND.
      if (this.rejoin) {
        this.sendNow({
          t: 'JOIN',
          room: this.rejoin.room,
          name: this.rejoin.name,
          asColor: this.rejoin.asColor,
        });
      }
      const handlers = this.onceOpen.splice(0);
      for (const h of handlers) {
        try {
          h();
        } catch (err) {
          console.error('whenOpen handler failed', err);
        }
      }
    };
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data) as ServerMsg;
        this.cb.onMessage(msg);
      } catch (err) {
        console.error('bad ws message', err);
      }
    };
    ws.onclose = () => {
      this.cb.onStatus('closed');
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (!this.intentionalClose) {
        const delay = Math.min(8000, 500 * 2 ** this.reconnectTries++);
        setTimeout(() => this.connect(), delay);
      }
    };
    ws.onerror = e => {
      console.warn('ws error', e);
    };
  }

  close() {
    this.intentionalClose = true;
    this.rejoin = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  /**
   * Record the rejoin info so that a future auto-reconnect can replay
   * the JOIN. Caller invokes this once after successfully entering a
   * room (e.g. on JOINED handler in the UI).
   */
  setRejoinInfo(info: RejoinInfo | null) {
    this.rejoin = info;
  }

  send(msg: ClientMsg) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Send without the open-check (used internally during onopen). */
  private sendNow(msg: ClientMsg) {
    this.ws?.send(JSON.stringify(msg));
  }
}

function envWsUrl(): string | undefined {
  // Vite injects `import.meta.env.VITE_WS_URL` at build time. Falls back
  // to undefined in non-Vite contexts (Node tests, server).
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
          .env
      : undefined;
  const url = env?.VITE_WS_URL;
  return url && url.trim() ? url.trim() : undefined;
}

export function defaultServerUrl(): string {
  // Allow build-time override (e.g. on Vercel: VITE_WS_URL=wss://my-server)
  // so static-hosted clients can find their dedicated WebSocket backend.
  const envUrl = envWsUrl();
  if (envUrl) return envUrl;
  if (typeof window === 'undefined') return 'ws://localhost:8787';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || 'localhost';
  return `${proto}://${host}:8787`;
}

/**
 * Returns true when the deployment is running on a static host (e.g.
 * Vercel) without a co-located WebSocket server. Used to surface a
 * helpful notice in the Online lobby instead of a silent connection
 * failure. Heuristic: no VITE_WS_URL env var AND we're on a non-local
 * https origin.
 */
export function isLikelyStaticHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (envWsUrl()) return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return window.location.protocol === 'https:';
}
