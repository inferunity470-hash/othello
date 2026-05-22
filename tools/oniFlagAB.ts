/**
 * Generic feature-flag A/B benchmark for the 鬼 AI (Codex T16 / v2.5).
 *
 * Usage: npx tsx tools/oniFlagAB.ts <FLAG> <onValue> [games] [chips]
 *   e.g. npx tsx tools/oniFlagAB.ts ONI_LMP 1 50 50
 *        npx tsx tools/oniFlagAB.ts ONI_EDGE_PATTERN 1 50 50
 *        npx tsx tools/oniFlagAB.ts ONI_FEAR_FACTOR 1 50 100
 *
 * v2 = flag set to <onValue>, v1 = flag '0'. Per-move env-var toggling so a
 * single process hosts both variants (race-safe — everything is synchronous).
 * Alternates which colour is v2 so the colour-of-mover bias cancels.
 * Random 4-ply opening per game for variance.
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

const FLAG = process.argv[2];
const ON = process.argv[3] ?? '1';
const N = parseInt(process.argv[4] ?? '50', 10);
const CHIPS = parseInt(process.argv[5] ?? '50', 10);

if (!FLAG) {
  console.error('Usage: npx tsx tools/oniFlagAB.ts <FLAG> <onValue> [games] [chips]');
  process.exit(1);
}

interface Result {
  v2Stones: number;
  v1Stones: number;
  durationMs: number;
  turns: number;
}

function setVariant(v: 'v1' | 'v2') {
  process.env[FLAG] = v === 'v1' ? '0' : ON;
}

function playOne(v2IsBlack: boolean, chips: number, seed: number): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // Random opening: 2 plies of random bids in [0..3] (variant-agnostic).
  // 4-ply / 0..4 caused ~80% wipeouts (see oni1000.ts); 2/0..3 keeps games alive.
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

// Games that end in an opening wipeout (a side reduced to 0 stones in the
// first few plies) are decided by the random opening, not by the flag — they
// add only noise. Skip any game with < MIN_TURNS turns and re-roll the seed.
const MIN_TURNS = 15;
console.log(
  `oni-v2 (${FLAG}=${ON}) vs oni-v1 (${FLAG}=0), ${N} real games, chips=${CHIPS}`
);
const t0 = Date.now();
let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
let v2StoneTotal = 0;
let v1StoneTotal = 0;
let real = 0;
let seed = 17;
let skipped = 0;
while (real < N && seed < 17 + N * 20) {
  const v2Black = real % 2 === 0;
  const r = playOne(v2Black, CHIPS, seed);
  seed++;
  if (r.turns < MIN_TURNS) {
    skipped++;
    continue;
  }
  real++;
  v2StoneTotal += r.v2Stones;
  v1StoneTotal += r.v1Stones;
  if (r.v2Stones > r.v1Stones) v2Wins++;
  else if (r.v1Stones > r.v2Stones) v1Wins++;
  else draws++;
  console.log(
    `  game ${real}/${N}: v2=${v2Black ? 'B' : 'W'} v2=${r.v2Stones} v1=${r.v1Stones} ` +
      `(${(r.durationMs / 1000).toFixed(1)}s, ${r.turns} turns, ` +
      `elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}
console.log(`(skipped ${skipped} opening-wipeout games)`);
const decided = v2Wins + v1Wins;
const winRate = v2Wins / Math.max(1, decided);
// Normal-approx 95% CI on the head-to-head win rate.
const se = decided > 0 ? Math.sqrt((winRate * (1 - winRate)) / decided) : 0;
const lo = Math.max(0, winRate - 1.96 * se);
const hi = Math.min(1, winRate + 1.96 * se);
console.log(
  `\nResult [${FLAG}=${ON}]: v2 ${v2Wins} / draws ${draws} / v1 ${v1Wins}  ` +
    `(${((Date.now() - t0) / 1000).toFixed(1)}s total)`
);
console.log(
  `v2 head-to-head win rate: ${(winRate * 100).toFixed(1)}% ` +
    `(95% CI ${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}%, n=${decided})`
);
console.log(
  `avg stones: v2 ${(v2StoneTotal / Math.max(1, real)).toFixed(1)} / ` +
    `v1 ${(v1StoneTotal / Math.max(1, real)).toFixed(1)}`
);
const verdict =
  lo > 0.5 ? 'WIN (CI 全体が 50% 超 — 既定 ON 推奨)'
  : hi < 0.5 ? 'LOSS (CI 全体が 50% 未満 — 既定 OFF 維持)'
  : 'INCONCLUSIVE (CI が 50% を跨ぐ — 中立/サンプル不足)';
console.log(`verdict: ${verdict}`);
