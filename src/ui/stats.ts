/**
 * Per-player statistics persisted to localStorage. Each completed game
 * appends a record. We keep the latest N records to bound storage.
 */

import { GameResult, GameState, TurnRecord } from '../core/types';

const KEY = 'othello-bidding:stats:v1';
const MAX_RECORDS = 100;

export interface GameRecord {
  endedAt: number;
  durationMs: number;
  options: { initialChips: number | { BLACK: number; WHITE: number }; cornerBonus: number };
  result: GameResult;
  turns: number;
  myColor?: 'BLACK' | 'WHITE' | 'SPECTATE';
  avgBid: { BLACK: number; WHITE: number };
  cornersTaken: { BLACK: number; WHITE: number };
  reverseAuctions: { BLACK: number; WHITE: number };
  tieBids: number;
}

function read(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(records: GameRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    /* quota / privacy — silently drop */
  }
}

export function recordGame(
  state: GameState,
  result: GameResult,
  myColor?: 'BLACK' | 'WHITE' | 'SPECTATE'
) {
  const turns = state.history.length;
  let bidCountB = 0,
    bidCountW = 0,
    bidSumB = 0,
    bidSumW = 0;
  let cornersB = 0,
    cornersW = 0;
  let reverseB = 0,
    reverseW = 0;
  let tieBids = 0;
  let prevHolder: 'BLACK' | 'WHITE' = 'BLACK';
  for (const t of state.history) {
    if (t.bids) {
      bidCountB++;
      bidCountW++;
      bidSumB += t.bids.BLACK;
      bidSumW += t.bids.WHITE;
      if (t.bids.BLACK === t.bids.WHITE) tieBids++;
      // Reverse auction: holder bid 0, non-holder bid > 0 and won
      if (t.bids.BLACK === 0 && t.bids.WHITE > 0 && prevHolder === 'BLACK') {
        reverseW++;
      } else if (t.bids.WHITE === 0 && t.bids.BLACK > 0 && prevHolder === 'WHITE') {
        reverseB++;
      }
    }
    if (t.cornerBonusTo === 'BLACK') cornersB++;
    if (t.cornerBonusTo === 'WHITE') cornersW++;
    prevHolder = t.initiativeAfter;
  }
  const record: GameRecord = {
    endedAt: state.endedAt ?? Date.now(),
    durationMs: (state.endedAt ?? Date.now()) - state.startedAt,
    options: {
      initialChips: state.options.initialChips,
      cornerBonus: state.options.cornerBonus,
    },
    result,
    turns,
    myColor,
    avgBid: {
      BLACK: bidCountB ? Math.round(bidSumB / bidCountB) : 0,
      WHITE: bidCountW ? Math.round(bidSumW / bidCountW) : 0,
    },
    cornersTaken: { BLACK: cornersB, WHITE: cornersW },
    reverseAuctions: { BLACK: reverseB, WHITE: reverseW },
    tieBids,
  };
  const records = read();
  records.push(record);
  write(records);
  return record;
}

export function loadRecords(): GameRecord[] {
  return read();
}

export function clearRecords() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface AggregatedStats {
  total: number;
  myWins: number;
  myLosses: number;
  draws: number;
  myAvgBidBlack: number;
  myAvgBidWhite: number;
  myCornerRate: number;
  myReverseAuctionRate: number;
  avgTurns: number;
  avgDurationSec: number;
  longestStreak: { kind: 'win' | 'loss' | 'none'; n: number };
}

export function aggregate(records: GameRecord[]): AggregatedStats {
  let myWins = 0,
    myLosses = 0,
    draws = 0;
  let bidB = 0,
    bidW = 0,
    cnt = 0;
  let myCorners = 0,
    myReverse = 0;
  let totalTurns = 0,
    totalDuration = 0;
  for (const r of records) {
    cnt++;
    if (r.result.winner === 'DRAW') draws++;
    else if (r.myColor && r.myColor !== 'SPECTATE') {
      if (r.result.winner === r.myColor) myWins++;
      else myLosses++;
    }
    bidB += r.avgBid.BLACK;
    bidW += r.avgBid.WHITE;
    totalTurns += r.turns;
    totalDuration += r.durationMs;
    if (r.myColor && r.myColor !== 'SPECTATE') {
      myCorners += r.cornersTaken[r.myColor];
      myReverse += r.reverseAuctions[r.myColor];
    }
  }
  // longest current streak
  let longestKind: 'win' | 'loss' | 'none' = 'none';
  let longestN = 0;
  let curKind: 'win' | 'loss' | null = null;
  let curN = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (!r.myColor || r.myColor === 'SPECTATE') break;
    const won = r.result.winner === r.myColor;
    const kind: 'win' | 'loss' = won ? 'win' : r.result.winner === 'DRAW' ? null! : 'loss';
    if (curKind === null) {
      curKind = kind;
      curN = 1;
    } else if (curKind === kind) {
      curN++;
    } else break;
  }
  if (curKind && curN > longestN) {
    longestKind = curKind;
    longestN = curN;
  }
  return {
    total: cnt,
    myWins,
    myLosses,
    draws,
    myAvgBidBlack: cnt ? Math.round(bidB / cnt) : 0,
    myAvgBidWhite: cnt ? Math.round(bidW / cnt) : 0,
    myCornerRate: cnt ? myCorners / cnt : 0,
    myReverseAuctionRate: cnt ? myReverse / cnt : 0,
    avgTurns: cnt ? Math.round(totalTurns / cnt) : 0,
    avgDurationSec: cnt ? Math.round(totalDuration / cnt / 1000) : 0,
    longestStreak: { kind: longestKind, n: longestN },
  };
}
