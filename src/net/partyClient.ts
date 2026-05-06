import { ClientMsg, ServerMsg } from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface ClientCallbacks {
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export class PartyClient {
  private ws: WebSocket | null = null;
  private reconnectTries = 0;
  private url: string;
  private cb: ClientCallbacks;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private onceOpen: Array<() => void> = [];

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
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  send(msg: ClientMsg) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
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
