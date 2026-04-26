import { GameState } from '../core/types';

const SAVE_PREFIX = 'othello-bidding:save:';
const PREF_PREFIX = 'othello-bidding:pref:';
const SAVE_VERSION = 1;

interface SnapshotV1 {
  v: 1;
  state: GameState;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / privacy errors */
  }
}

function safeDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Save a snapshot of the in-progress game. Snapshot-based (vs event sourcing)
 * so we can faithfully restore mid-turn states (e.g. after bid resolved but
 * before placement) without needing the event log to be complete.
 */
export function saveGame(slot: string, state: GameState) {
  const snap: SnapshotV1 = { v: SAVE_VERSION, state };
  safeSet(SAVE_PREFIX + slot, JSON.stringify(snap));
}

export function loadGame(slot: string): GameState | null {
  const raw = safeGet(SAVE_PREFIX + slot);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SnapshotV1;
    if (parsed.v !== SAVE_VERSION || !parsed.state) return null;
    return parsed.state;
  } catch (err) {
    console.warn('failed to restore save', err);
    return null;
  }
}

export function clearSave(slot: string) {
  safeDel(SAVE_PREFIX + slot);
}

/** UI preference helpers (theme, color-blind, motion, ...). */
export function getPref(name: string, fallback: string): string {
  return safeGet(PREF_PREFIX + name) ?? fallback;
}

export function setPref(name: string, value: string) {
  safeSet(PREF_PREFIX + name, value);
}
