/**
 * Oni weakness profile — N games of oni-vs-oni self-play with per-turn
 * telemetry; reports aggregated metrics that surface where the 鬼 leaks
 * value (overbid rate, holder/non-holder asymmetry, corner ownership,
 * tiebreaker outcomes).
 *
 * Designed to complement tools/oniVsOni.ts (which only reports aggregate
 * win rates) and to give v2.x → v2.y A/B tests a richer per-game signal
 * surface. See codex-review-T10-oni1000-analysis.md for the analysis
 * gaps this tool is meant to close.
 *
 * Use: `npx tsx tools/oniWeaknessProfile.ts <games> [chips]`
 *
 *   games  default 50
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
import type { Color, GameState } from '../src/core/types.ts';

interface TurnTelemetry {
  emptiesBefore: number;
  holder: Color;
  bidBlack: number;
  bidWhite: number;
  winner: Color | 'tie';
  moverPlaced?: { row: number; col: number; mover: Color };
}

interface GameTelemetry {
  seed: number;
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: GameState['endReason'];
  blackWon: boolean; // (uses raw stone count; ties counted as draw)
  draw: boolean;
  cornersBlack: number;
  cornersWhite: number;
  turnLog: TurnTelemetry[];
}

const CORNERS: Array<[number, number]> = [
  [0, 0],
  [0, 7],
  [7, 0],
  [7, 7],
];

function countCorners(board: GameState['board']): { B: number; W: number } {
  let B = 0;
  let W = 0;
  for (const [r, c] of CORNERS) {
    const cell = board[r][c];
    if (cell === 'BLACK') B++;
    else if (cell === 'WHITE') W++;
  }
  return { B, W };
}

function playOne(seed: number, initialChips: number): GameTelemetry {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });

  // Random opening: 4 plies of bids in [0..4] for diversity.
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
  const turnLog: TurnTelemetry[] = [];
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const emptiesBefore = s.board.flat().filter(c => c === null).length;
      const holder = s.initiativeHolder;
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      const resolution = resolvePendingBids(s);
      s = resolution.state;
      const winner =
        bb > bw ? ('BLACK' as const) : bw > bb ? ('WHITE' as const) : ('tie' as const);
      let placed: TurnTelemetry['moverPlaced'];
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
        placed = { row: m.row, col: m.col, mover };
      }
      turnLog.push({ emptiesBefore, holder, bidBlack: bb, bidWhite: bw, winner, moverPlaced: placed });
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
  const corners = countCorners(s.board);
  return {
    seed,
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    blackChipsLeft: s.players.BLACK.chips,
    whiteChipsLeft: s.players.WHITE.chips,
    turns: s.history.length,
    durationMs: dur,
    endReason: s.endReason,
    blackWon: stones.BLACK > stones.WHITE,
    draw: stones.BLACK === stones.WHITE,
    cornersBlack: corners.B,
    cornersWhite: corners.W,
    turnLog,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function summarize(records: GameTelemetry[]): void {
  const n = records.length;
  const blackWins = records.filter(r => r.blackWon).length;
  const draws = records.filter(r => r.draw).length;
  const whiteWins = n - blackWins - draws;

  // Aggregate corner ownership of winner vs loser
  let cornersOfWinner: number[] = [];
  let cornersOfLoser: number[] = [];
  let marginVsCornerDelta: Array<{ margin: number; cornerDelta: number }> = [];
  for (const r of records) {
    const cornerDelta = r.cornersBlack - r.cornersWhite;
    const margin = r.blackStones - r.whiteStones;
    marginVsCornerDelta.push({ margin, cornerDelta });
    if (r.blackWon) {
      cornersOfWinner.push(r.cornersBlack);
      cornersOfLoser.push(r.cornersWhite);
    } else if (!r.draw) {
      cornersOfWinner.push(r.cornersWhite);
      cornersOfLoser.push(r.cornersBlack);
    }
  }

  // Holder asymmetry: among games not ending in a draw, did the side that
  // held initiative more often win more often?
  let holderTotal = 0;
  let nonHolderTotal = 0;
  let holderWinsBlackHeld = 0;
  let holderWinsWhiteHeld = 0;
  for (const r of records) {
    for (const t of r.turnLog) {
      if (t.holder === 'BLACK') holderWinsBlackHeld++;
      else holderWinsWhiteHeld++;
    }
    holderTotal += r.turnLog.filter(t => t.holder === (r.blackWon ? 'BLACK' : 'WHITE'))
      .length;
    nonHolderTotal += r.turnLog.filter(t => t.holder === (r.blackWon ? 'WHITE' : 'BLACK'))
      .length;
  }

  // Bid distributions: split by holder vs non-holder.
  let holderBids: number[] = [];
  let nonHolderBids: number[] = [];
  let bidsInWinningGames: number[] = [];
  let bidsInLosingGames: number[] = [];
  let tieBidCount = 0;
  let zeroBidCount = 0;
  let totalBids = 0;
  for (const r of records) {
    for (const t of r.turnLog) {
      totalBids++;
      if (t.bidBlack === t.bidWhite) tieBidCount++;
      if (t.bidBlack === 0 && t.bidWhite === 0) zeroBidCount++;
      const blackBidIsHolder = t.holder === 'BLACK';
      holderBids.push(blackBidIsHolder ? t.bidBlack : t.bidWhite);
      nonHolderBids.push(blackBidIsHolder ? t.bidWhite : t.bidBlack);

      // Bid efficiency proxy: did the bid winner end up winning the game?
      const turnWinner = t.bidBlack > t.bidWhite ? 'BLACK' : t.bidWhite > t.bidBlack ? 'WHITE' : null;
      const gameWinner = r.draw ? null : r.blackWon ? 'BLACK' : 'WHITE';
      if (gameWinner && turnWinner === gameWinner) {
        bidsInWinningGames.push(Math.max(t.bidBlack, t.bidWhite));
      } else if (gameWinner && turnWinner && turnWinner !== gameWinner) {
        bidsInLosingGames.push(Math.max(t.bidBlack, t.bidWhite));
      }
    }
  }

  // Game length / chips
  const turnsList = records.map(r => r.turns);
  const blackChipsLeft = records.map(r => r.blackChipsLeft);
  const whiteChipsLeft = records.map(r => r.whiteChipsLeft);

  console.log(`\n========================================`);
  console.log(`  Oni weakness profile (N = ${n})`);
  console.log(`========================================\n`);

  console.log(`Win-rate (BLACK has initial token)`);
  console.log(`  BLACK wins: ${blackWins} (${((blackWins * 100) / n).toFixed(1)}%)`);
  console.log(`  WHITE wins: ${whiteWins} (${((whiteWins * 100) / n).toFixed(1)}%)`);
  console.log(`  Draws:      ${draws} (${((draws * 100) / n).toFixed(1)}%)`);
  console.log();

  console.log(`Margin (B-W stones)`);
  const margins = records.map(r => r.blackStones - r.whiteStones);
  console.log(`  mean   : ${mean(margins).toFixed(2)}`);
  console.log(`  median : ${median(margins)}`);
  console.log();

  console.log(`Corners`);
  console.log(`  Winner's avg corners: ${mean(cornersOfWinner).toFixed(2)}`);
  console.log(`  Loser's  avg corners: ${mean(cornersOfLoser).toFixed(2)}`);
  console.log(
    `  Corner delta vs margin correlation:`,
    correlation(
      marginVsCornerDelta.map(m => m.cornerDelta),
      marginVsCornerDelta.map(m => m.margin)
    ).toFixed(3)
  );
  console.log();

  console.log(`Bids (per-turn)`);
  console.log(`  Total turns: ${totalBids}`);
  console.log(`  Tie bids:    ${tieBidCount} (${((tieBidCount * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
  console.log(`  Both zero:   ${zeroBidCount} (${((zeroBidCount * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
  console.log(`  Holder avg:     ${mean(holderBids).toFixed(2)}`);
  console.log(`  Non-holder avg: ${mean(nonHolderBids).toFixed(2)}`);
  console.log(`  Winning-side bid mean : ${mean(bidsInWinningGames).toFixed(2)}`);
  console.log(`  Losing-side bid mean  : ${mean(bidsInLosingGames).toFixed(2)}`);
  console.log();

  console.log(`Endgame`);
  console.log(`  Avg turns: ${mean(turnsList).toFixed(1)}`);
  console.log(`  BLACK chips left mean: ${mean(blackChipsLeft).toFixed(1)}`);
  console.log(`  WHITE chips left mean: ${mean(whiteChipsLeft).toFixed(1)}`);
  console.log();
}

function correlation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

const N = parseInt(process.argv[2] ?? '50', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
console.log(`Oni weakness profile: ${N} games at chips=${CHIPS}\n`);
const t0 = Date.now();
const records: GameTelemetry[] = [];
for (let i = 0; i < N; i++) {
  const r = playOne(i + 1, CHIPS);
  records.push(r);
  if ((i + 1) % 5 === 0) {
    process.stdout.write(
      `  game ${i + 1}/${N} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s\n`
    );
  }
}
summarize(records);
console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
