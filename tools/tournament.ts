/**
 * Quick AI tournament harness for measuring relative strength.
 *
 * Plays N games at each chip setting, alternating colors, and tabulates
 * the result. Used as a quick pre/post benchmark when tuning the AI.
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
import { Color, GameState } from '../src/core/types.ts';

const OPENING_PLY = 4;

interface Result {
  blackStones: number;
  whiteStones: number;
  turns: number;
  durationMs: number;
}

function playOne(
  black: AILevel,
  white: AILevel,
  initialChips: number,
  seed: number
): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });
  // Random opening to break determinism between same-level players
  for (let p = 0; p < OPENING_PLY; p++) {
    if (s.phase !== 'BIDDING') break;
    const bidB = Math.floor(rng() * 5);
    const bidW = Math.floor(rng() * 5);
    s = setPendingBid(s, 'BLACK', bidB);
    s = setPendingBid(s, 'WHITE', bidW);
    const out = resolvePendingBids(s);
    s = out.state;
    if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE' || s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const start = Date.now();
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl: AILevel = mover === 'BLACK' ? black : white;
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
  const dur = Date.now() - start;
  const stones = countStones(s.board);
  return {
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    turns: s.history.length,
    durationMs: dur,
  };
}

function tournament(
  champ: AILevel,
  challenger: AILevel,
  games: number,
  initialChips: number
) {
  let champWins = 0;
  let challWins = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalMs = 0;
  for (let i = 0; i < games; i++) {
    const champBlack = i % 2 === 0;
    const r = playOne(
      champBlack ? champ : challenger,
      champBlack ? challenger : champ,
      initialChips,
      i + 1009
    );
    const champStones = champBlack ? r.blackStones : r.whiteStones;
    const challStones = champBlack ? r.whiteStones : r.blackStones;
    if (champStones > challStones) champWins++;
    else if (champStones < challStones) challWins++;
    else draws++;
    totalTurns += r.turns;
    totalMs += r.durationMs;
  }
  const avgT = (totalTurns / games).toFixed(1);
  const avgMs = (totalMs / games).toFixed(0);
  console.log(
    `${champ.padEnd(13)} vs ${challenger.padEnd(13)} chips=${initialChips} → ` +
      `${champ} ${champWins} / draws ${draws} / ${challenger} ${challWins}  ` +
      `(avg ${avgT} turns, ${avgMs} ms)`
  );
}

const args = process.argv.slice(2);
const games = parseInt(args[0] ?? '6', 10);

console.log(`Tournament: ${games} games per pairing\n`);
const t0 = Date.now();

for (const chips of [50, 100, 200]) {
  tournament('oni', 'advanced', games, chips);
  tournament('oni', 'intermediate', games, chips);
  tournament('advanced', 'intermediate', games, chips);
  tournament('intermediate', 'beginner', games, chips);
  console.log('');
}

console.log(`Total ${(Date.now() - t0) / 1000}s`);
