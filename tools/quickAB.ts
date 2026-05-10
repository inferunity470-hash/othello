/**
 * Quick A/B: oni-v2 (cornerAdj ON) vs advanced.
 * Run with `ONI_CORNER_ADJ=0` for v1 baseline, default for v2.
 *
 * Single chip setting (50) and 6 games to keep total time manageable.
 */
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng, AILevel } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import { GameState } from '../src/core/types.ts';

function play(black: AILevel, white: AILevel, chips: number, seed: number) {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // Light random opening: 2 plies only (less wipeout risk).
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
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bb = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl = mover === 'BLACK' ? black : white;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? black : white;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl = s.initiativeHolder === 'BLACK' ? black : white;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  return countStones(s.board);
}

const N = parseInt(process.argv[2] ?? '6', 10);
const CHIPS = parseInt(process.argv[3] ?? '50', 10);
const variant = process.env.ONI_CORNER_ADJ === '0' ? 'v1 (cornerAdj OFF)' : 'v2 (cornerAdj ON)';
console.log(`oni ${variant} vs intermediate, ${N} games, chips=${CHIPS}`);

let oniWins = 0;
let intWins = 0;
let draws = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const oniBlack = i % 2 === 0;
  const r = play(
    oniBlack ? 'oni' : 'intermediate',
    oniBlack ? 'intermediate' : 'oni',
    CHIPS,
    i + 1009
  );
  const oniS = oniBlack ? r.BLACK : r.WHITE;
  const intS = oniBlack ? r.WHITE : r.BLACK;
  if (oniS > intS) oniWins++;
  else if (intS > oniS) intWins++;
  else draws++;
  console.log(
    `  game ${i + 1}: oni=${oniBlack ? 'B' : 'W'} oni=${oniS} int=${intS} (elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}
console.log(`\nResult: oni ${oniWins} / draws ${draws} / int ${intWins}`);
