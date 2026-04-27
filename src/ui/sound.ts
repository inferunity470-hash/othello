/**
 * Tiny synthesised sound effects via the Web Audio API.
 *
 * Design goals (per user request):
 *   - 派手でない (subtle): low volume, short tones
 *   - No external audio assets (everything generated)
 *   - Graceful degradation: in non-browser environments (jsdom, Node) all
 *     calls become no-ops without throwing.
 */

export type SoundName =
  | 'place'        // a stone is placed on the board
  | 'flip'         // one or more stones flipped
  | 'bid'          // a bid was confirmed (UI tick)
  | 'reveal'       // bid reveal modal opens
  | 'cornerBonus'  // chip count went up (e.g. corner bonus)
  | 'gameWin'
  | 'gameLose'
  | 'gameDraw';

interface SoundEngineState {
  enabled: boolean;
  volume: number; // 0..1
}

const state: SoundEngineState = {
  enabled: true,
  volume: 0.35,
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const W = window as any;
  const Ctor = W.AudioContext || W.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    masterGain = ctx!.createGain();
    masterGain.gain.value = state.volume;
    masterGain.connect(ctx!.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Play a single tone with a quick attack and exponential decay.
 * All numbers are SI: seconds, Hz, linear gain 0..1.
 */
function tone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  peakGain = 0.5,
  attackSec = 0.005
) {
  const c = getCtx();
  if (!c || !masterGain) return;
  // Resume if suspended (browser autoplay policy)
  if (c.state === 'suspended') {
    c.resume().catch(() => {});
  }
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peakGain, now + attackSec);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/** Sequence of tones with relative onset offsets. */
function seq(notes: Array<{ at: number; freq: number; dur: number; type?: OscillatorType; gain?: number }>) {
  for (const n of notes) {
    setTimeout(() => tone(n.freq, n.dur, n.type ?? 'sine', n.gain ?? 0.5), n.at * 1000);
  }
}

export function play(name: SoundName) {
  if (!state.enabled) return;
  switch (name) {
    case 'place':
      tone(180, 0.07, 'sine', 0.55);
      break;
    case 'flip':
      tone(420, 0.05, 'triangle', 0.32);
      break;
    case 'bid':
      tone(660, 0.04, 'square', 0.18);
      break;
    case 'reveal':
      seq([
        { at: 0, freq: 523, dur: 0.16 },
        { at: 0.09, freq: 659, dur: 0.18 },
      ]);
      break;
    case 'cornerBonus':
      seq([
        { at: 0, freq: 659, dur: 0.10, gain: 0.45 },
        { at: 0.06, freq: 988, dur: 0.16, gain: 0.45 },
      ]);
      break;
    case 'gameWin':
      seq([
        { at: 0.00, freq: 523, dur: 0.13, type: 'triangle', gain: 0.55 },
        { at: 0.10, freq: 659, dur: 0.13, type: 'triangle', gain: 0.55 },
        { at: 0.20, freq: 784, dur: 0.22, type: 'triangle', gain: 0.6 },
      ]);
      break;
    case 'gameLose':
      seq([
        { at: 0.00, freq: 392, dur: 0.18, type: 'triangle', gain: 0.4 },
        { at: 0.13, freq: 311, dur: 0.26, type: 'triangle', gain: 0.4 },
      ]);
      break;
    case 'gameDraw':
      seq([
        { at: 0.00, freq: 523, dur: 0.14, gain: 0.4 },
        { at: 0.12, freq: 523, dur: 0.14, gain: 0.4 },
      ]);
      break;
  }
}

export function setEnabled(b: boolean) {
  state.enabled = b;
  if (!b && ctx && ctx.state === 'running') {
    // Don't suspend; some browsers require gesture again to resume.
  }
}

export function isEnabled() {
  return state.enabled;
}

export function setVolume(v: number) {
  state.volume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = state.volume;
}

export function getVolume() {
  return state.volume;
}
