/**
 * A/B benchmark: oni bidding v2 (asymmetric base + symmetric token cost
 * + relaxed endgame cap) vs oni bidding v1 (legacy). Same game engine,
 * same eval — only the bid logic switches via `ONI_BID_V2` env var.
 *
 * Per-move env var toggling so one process can host both variants.
 *
 * Usage: `npx tsx tools/oniBidAB.ts [games] [chips]`  (defaults: 6, 100)
 */
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

interface Result {
  v2Stones: number;
  v1Stones: number;
  durationMs: number;
  turns: number;
}

function setVariant(v: 'v1' | 'v2') {
  process.env.ONI_BID_V2 = v === 'v1' ? '0' : '1';
}

function playOne(v2IsBlack: boolean, chips: number, seed: number): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // 2-ply random opening for diversity.
  for (let p = 0; p < 2 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 4));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 4));
    s = resolvePendingBids(s).state;
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
  const variantOf = (c: Color): 'v1' | 'v2' =>
    (v2IsBlack && c === 'BLACK') || (!v2IsBlack && c === 'WHITE') ? 'v2' : 'v1';
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      setVariant(variantOf('BLACK'));
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      setVariant(variantOf('WHITE'));
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        setVariant(variantOf(mover));
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      setVariant(variantOf(mover));
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        setVariant(variantOf(s.initiativeHolder));
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const stones = countStones(s.board);
  const v2Stones = v2IsBlack ? stones.BLACK : stones.WHITE;
  const v1Stones = v2IsBlack ? stones.WHITE : stones.BLACK;
  return { v2Stones, v1Stones, durationMs: Date.now() - t0, turns: s.history.length };
}

const N = parseInt(process.argv[2] ?? '6', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
console.log(`oni-bid v2 vs v1, ${N} games, chips=${CHIPS}`);
const t0 = Date.now();
let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
for (let i = 0; i < N; i++) {
  const v2Black = i % 2 === 0;
  const r = playOne(v2Black, CHIPS, i + 71);
  if (r.v2Stones > r.v1Stones) v2Wins++;
  else if (r.v1Stones > r.v2Stones) v1Wins++;
  else draws++;
  console.log(
    `  game ${i + 1}: v2=${v2Black ? 'B' : 'W'} v2=${r.v2Stones} v1=${r.v1Stones} ` +
      `(${(r.durationMs / 1000).toFixed(1)}s, ${r.turns} turns)`
  );
}
console.log(
  `\nResult: v2 ${v2Wins} / draws ${draws} / v1 ${v1Wins}  ` +
    `(${((Date.now() - t0) / 1000).toFixed(1)}s total)`
);
const winRate = v2Wins / Math.max(1, v2Wins + v1Wins);
console.log(`v2 head-to-head win rate: ${(winRate * 100).toFixed(1)}%`);
