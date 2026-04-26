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

  constructor(url: string, cb: ClientCallbacks) {
    this.url = url;
    this.cb = cb;
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

export function defaultServerUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8787';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || 'localhost';
  return `${proto}://${host}:8787`;
}
