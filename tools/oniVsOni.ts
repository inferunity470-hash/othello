/**
 * Oni-vs-oni mass self-play.
 *
 * Generates N games with random openings (4 random plies) and prints
 * aggregate statistics: BLACK win rate, score margin distribution,
 * average game length, average chip cost.
 *
 * Use: `npx tsx tools/oniVsOni.ts <games> [chips]`
 *
 *   games  default 100
 *   chips  default 100
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
import type { GameState } from '../src/core/types.ts';

interface GameRecord {
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: GameState['endReason'];
  // Sum of bids per side
  totalBidBlack: number;
  totalBidWhite: number;
}

function playOne(seed: number, initialChips: number): GameRecord {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });
  // Random opening: 4 plies of bids in [0..4]
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
  let totalBidBlack = 0;
  let totalBidWhite = 0;
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      totalBidBlack += bb;
      totalBidWhite += bw;
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
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
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    blackChipsLeft: s.players.BLACK.chips,
    whiteChipsLeft: s.players.WHITE.chips,
    turns: s.history.length,
    durationMs: dur,
    endReason: s.endReason,
    totalBidBlack,
    totalBidWhite,
  };
}

function summarize(records: GameRecord[]) {
  const n = records.length;
  let blackWins = 0;
  let whiteWins = 0;
  let draws = 0;
  let blackMargins: number[] = [];
  let totalTurns = 0;
  let totalMs = 0;
  let endReasons: Record<string, number> = {};
  for (const r of records) {
    if (r.blackStones > r.whiteStones) blackWins++;
    else if (r.whiteStones > r.blackStones) whiteWins++;
    else draws++;
    blackMargins.push(r.blackStones - r.whiteStones);
    totalTurns += r.turns;
    totalMs += r.durationMs;
    const er = r.endReason ?? 'unknown';
    endReasons[er] = (endReasons[er] ?? 0) + 1;
  }
  blackMargins.sort((a, b) => a - b);
  const median = blackMargins[Math.floor(n / 2)] ?? 0;
  const p10 = blackMargins[Math.floor(n * 0.1)] ?? 0;
  const p90 = blackMargins[Math.floor(n * 0.9)] ?? 0;
  const meanMargin =
    blackMargins.reduce((a, b) => a + b, 0) / Math.max(1, n);
  console.log(`\n=== ${n} games summary ===`);
  console.log(`  BLACK wins: ${blackWins} (${((blackWins * 100) / n).toFixed(1)}%)`);
  console.log(`  WHITE wins: ${whiteWins} (${((whiteWins * 100) / n).toFixed(1)}%)`);
  console.log(`  Draws:      ${draws} (${((draws * 100) / n).toFixed(1)}%)`);
  console.log(
    `  Margin (B-W): mean ${meanMargin.toFixed(1)}, median ${median}, p10 ${p10}, p90 ${p90}`
  );
  console.log(`  Avg turns: ${(totalTurns / n).toFixed(1)}`);
  console.log(`  Avg duration: ${(totalMs / n / 1000).toFixed(1)}s/game`);
  console.log(`  End reasons:`, endReasons);
  // Decisive games (margin >= 10)
  const decisive = records.filter(r => Math.abs(r.blackStones - r.whiteStones) >= 10);
  console.log(`  Decisive (|B-W|>=10): ${decisive.length} (${((decisive.length * 100) / n).toFixed(1)}%)`);
}

const N = parseInt(process.argv[2] ?? '100', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
console.log(`Oni-vs-oni self-play: ${N} games at chips=${CHIPS}\n`);
const t0 = Date.now();
const records: GameRecord[] = [];
for (let i = 0; i < N; i++) {
  const r = playOne(i + 1, CHIPS);
  records.push(r);
  if ((i + 1) % 10 === 0) {
    process.stdout.write(`  game ${i + 1}/${N} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
}
summarize(records);
console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
