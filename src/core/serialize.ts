import { GameOptions, GameState, TurnRecord } from './types';
import { initGame } from './gameLoop';
import { replayEvents } from './events';

export interface GameDocument {
  v: 1;
  options: GameOptions;
  history: TurnRecord[];
  startedAt: number;
  endedAt?: number;
  endReason?: GameState['endReason'];
  /** Optional metadata for sharing. */
  meta?: {
    blackName?: string;
    whiteName?: string;
    note?: string;
  };
}

export function exportGame(state: GameState, meta?: GameDocument['meta']): GameDocument {
  return {
    v: 1,
    options: state.options,
    history: state.history,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    endReason: state.endReason,
    meta,
  };
}

export function exportGameJson(state: GameState, meta?: GameDocument['meta']): string {
  return JSON.stringify(exportGame(state, meta), null, 2);
}

export function importGame(json: string | object): GameState {
  const doc = (typeof json === 'string' ? JSON.parse(json) : json) as GameDocument;
  if (!doc || doc.v !== 1) {
    throw new Error('Unsupported game document version');
  }
  if (!doc.options || !Array.isArray(doc.history)) {
    throw new Error('Malformed game document');
  }
  // Replay history to reconstruct exact state.
  const s = replayEvents(doc.options, doc.history);
  // H7: replayEvents reruns initGame() / applyPlacement, so it regenerates
  // startedAt and each TurnRecord.timestamp from Date.now(). Restore the
  // original metadata so export → import is fully reversible.
  return {
    ...s,
    startedAt: doc.startedAt ?? s.startedAt,
    endedAt: doc.endedAt ?? s.endedAt,
    endReason: doc.endReason ?? s.endReason,
    history: s.history.map((h, i) => {
      const orig = doc.history[i];
      return orig && orig.timestamp != null ? { ...h, timestamp: orig.timestamp } : h;
    }),
  };
}

export function downloadGameJson(
  state: GameState,
  filename = 'othello-bidding-game.json'
) {
  if (typeof window === 'undefined') return;
  const text = exportGameJson(state);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** Encode game state into a base64url-ish string for URL sharing. */
export function encodeGameForUrl(state: GameState): string {
  const text = JSON.stringify(exportGame(state));
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(text)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  // Node fallback (used only in tests / non-browser tooling).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer;
  if (buf) return buf.from(text, 'utf-8').toString('base64url');
  throw new Error('No base64 encoder available');
}

export function decodeGameFromUrl(s: string): GameState {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  let text: string;
  if (typeof atob !== 'undefined') {
    text = decodeURIComponent(escape(atob(padded)));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = (globalThis as any).Buffer;
    if (!buf) throw new Error('No base64 decoder available');
    text = buf.from(s, 'base64url').toString('utf-8');
  }
  return importGame(text);
}

export { initGame };
