/**
 * A/B benchmark: oni with cornerAdjacentScore enabled vs oni with the
 * feature disabled. Both AIs share the same code path; the toggle is
 * the `ONI_CORNER_ADJ` env var consulted inside `evaluateBoard`.
 *
 * Usage: `npx tsx tools/oniAB.ts [games]`  (default 12)
 *
 * Method: alternate which side is "v2" so colour-of-mover bias cancels.
 * Random opening (4 plies) per game for variance.
 *
 * The trick: spawn a child process per game with the env var fixed, so
 * one tsx process can't be "v2" in one branch and "v1" in another.
 *
 * For simpler in-process A/B we instead override the env var per move
 * by setting `process.env.ONI_CORNER_ADJ` before each call. This is
 * race-safe because everything is synchronous in this script.
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
import { Color, GameState } from '../src/core/types.ts';

interface Result {
  v2Stones: number;
  v1Stones: number;
  durationMs: number;
  turns: number;
}

function setVariant(v: 'v1' | 'v2') {
  process.env.ONI_CORNER_ADJ = v === 'v1' ? '0' : '1';
}

function playOne(v2IsBlack: boolean, chips: number, seed: number): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // Random opening (variant doesn't matter — uniform 0-4 bids).
  for (let p = 0; p < 4 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 5));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 5));
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
  return {
    v2Stones,
    v1Stones,
    durationMs: Date.now() - t0,
    turns: s.history.length,
  };
}

const N = parseInt(process.argv[2] ?? '12', 10);
const CHIPS = parseInt(process.argv[3] ?? '30', 10);
console.log(`oni-v2 (cornerAdjacentScore ON) vs oni-v1 (OFF), ${N} games, chips=${CHIPS}`);
const t0 = Date.now();
let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
for (let i = 0; i < N; i++) {
  const v2Black = i % 2 === 0;
  const r = playOne(v2Black, CHIPS, i + 17);
  if (r.v2Stones > r.v1Stones) v2Wins++;
  else if (r.v1Stones > r.v2Stones) v1Wins++;
  else draws++;
  console.log(
    `  game ${i + 1}: v2=${v2Black ? 'B' : 'W'} v2=${r.v2Stones} v1=${r.v1Stones} (${(r.durationMs / 1000).toFixed(1)}s, ${r.turns} turns)`
  );
}
console.log(
  `\nResult: v2 ${v2Wins} / draws ${draws} / v1 ${v1Wins}  (${((Date.now() - t0) / 1000).toFixed(1)}s total)`
);
const winRate = v2Wins / Math.max(1, v2Wins + v1Wins);
console.log(`v2 head-to-head win rate: ${(winRate * 100).toFixed(1)}%`);
