/**
 * Long-running oni-vs-oni self-play with detailed telemetry.
 *
 * Writes one JSON line per game (sync, flushed) to `data/oni-runs.jsonl`,
 * so progress survives crashes and is observable by tail -f. Run in the
 * background with:
 *
 *   nohup npx tsx tools/oni1000.ts 1000 100 > data/oni-1000.log 2>&1 &
 *
 * Each line schema:
 *   { game, seed, blackStones, whiteStones, blackChipsLeft, whiteChipsLeft,
 *     turns, durationMs, endReason, bids: [{turn, B, W, holderBefore, winner,
 *                                            phase, emptiesBefore}, …] }
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import type { Color, GameState } from '../src/core/types.ts';

interface BidRecord {
  turn: number;
  B: number;
  W: number;
  holderBefore: Color;
  winner: Color | null; // null on tie-no-spend
  phase: 'open' | 'mid' | 'end';
  emptiesBefore: number;
}

interface GameRecord {
  game: number;
  seed: number;
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: GameState['endReason'];
  bids: BidRecord[];
}

function countEmpty(board: GameState['board']): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

function phaseFromEmpties(empties: number): 'open' | 'mid' | 'end' {
  const filled = 64 - empties;
  if (filled < 20) return 'open';
  if (filled < 50) return 'mid';
  return 'end';
}

function playOne(seed: number, initialChips: number, gameIdx: number): GameRecord {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });
  // Random opening: 2 plies of random bids in [0..3] for diversity.
  // 4-ply / 0..4 caused ~80% wipeouts (no telemetry); 2/0..3 keeps games alive.
  for (let p = 0; p < 2 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 4));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 4));
    const out = resolvePendingBids(s);
    s = out.state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const t0 = Date.now();
  const bids: BidRecord[] = [];
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const emptiesBefore = countEmpty(s.board);
      const holderBefore: Color = s.initiativeHolder;
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      const before = s;
      s = resolvePendingBids(s).state;
      // Determine the bid winner from initiativeHolder change or who is to move.
      let winner: Color | null = null;
      if (bb > bw) winner = 'BLACK';
      else if (bw > bb) winner = 'WHITE';
      else if (bb === bw && bb > 0) {
        // tie with positive bid → goes to holder under Bidding rules
        winner = before.initiativeHolder;
      } // else null (both 0)
      bids.push({
        turn: s.history.length,
        B: bb,
        W: bw,
        holderBefore,
        winner,
        phase: phaseFromEmpties(emptiesBefore),
        emptiesBefore,
      });
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const dur = Date.now() - t0;
  const stones = countStones(s.board);
  return {
    game: gameIdx,
    seed,
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    blackChipsLeft: s.players.BLACK.chips,
    whiteChipsLeft: s.players.WHITE.chips,
    turns: s.history.length,
    durationMs: dur,
    endReason: s.endReason,
    bids,
  };
}

const N = parseInt(process.argv[2] ?? '1000', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
// Start index — when resuming after a crash, pass the next game number
// (e.g., if 283 games were saved, pass 284). Defaults to 1.
const START = parseInt(process.argv[4] ?? '1', 10);
// Output file path. If provided, append to it (resume mode); otherwise
// create a new timestamped file.
const OUT_DIR = path.join(process.cwd(), 'data');
const OUT_FILE = process.argv[5]
  ? path.resolve(process.argv[5])
  : path.join(OUT_DIR, `oni-runs-${Date.now()}.jsonl`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const stream = fs.openSync(OUT_FILE, 'a');
console.log(`Oni-vs-oni mass self-play: ${N} games at chips=${CHIPS}, starting from game ${START}`);
console.log(`Logging to: ${OUT_FILE}`);
const t0 = Date.now();
let blackWins = 0;
let whiteWins = 0;
let draws = 0;
for (let i = START - 1; i < N; i++) {
  const r = playOne(i + 1, CHIPS, i + 1);
  fs.writeSync(stream, JSON.stringify(r) + '\n');
  fs.fsyncSync(stream);
  if (r.blackStones > r.whiteStones) blackWins++;
  else if (r.whiteStones > r.blackStones) whiteWins++;
  else draws++;
  const elapsed = (Date.now() - t0) / 1000;
  const done = i + 2 - START;
  const rate = done / Math.max(0.001, elapsed);
  const remaining = (N - i - 1) / Math.max(0.001, rate);
  console.log(
    `game ${i + 1}/${N}: B=${r.blackStones} W=${r.whiteStones} ` +
      `turns=${r.turns} dur=${(r.durationMs / 1000).toFixed(1)}s ` +
      `[B:${blackWins}/D:${draws}/W:${whiteWins}] ` +
      `eta=${(remaining / 60).toFixed(1)}min`
  );
}
fs.closeSync(stream);
console.log(`\n=== ${N} games complete ===`);
console.log(`  BLACK wins: ${blackWins} (${((blackWins * 100) / N).toFixed(1)}%)`);
console.log(`  Draws:      ${draws} (${((draws * 100) / N).toFixed(1)}%)`);
console.log(`  WHITE wins: ${whiteWins} (${((whiteWins * 100) / N).toFixed(1)}%)`);
console.log(`  Total: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
console.log(`  Log: ${OUT_FILE}`);
