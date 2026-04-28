/**
 * AI-vs-AI batch statistics for the placement-driven token rule.
 *
 * Since AI levels above beginner are deterministic, we randomise the
 * opening: 4 random moves are played before the AIs take over. Different
 * seeds → different opening positions → varied games.
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

const LEVELS = ['intermediate', 'advanced'] as const;
const CHIP_OPTIONS = [50, 100, 200];
const OPENING_MOVES = 4;

function playOne(black: any, white: any, initialChips: number, seed: number) {
  const rng = makeRng(seed);
  ttClear();
  let s = initGame({ initialChips });

  const stats: any = {
    winnerColor: 'DRAW',
    blackStones: 0,
    whiteStones: 0,
    blackChipsLeft: 0,
    whiteChipsLeft: 0,
    turns: 0,
    bidTurns: 0,
    tieBids: 0,
    tokenTransfers: 0,
    tokenStayed: 0,
    zeroZeroBids: 0,
    reverseAuctionWins: 0,
    paymentByBlack: 0,
    paymentByWhite: 0,
    endReason: null,
    finalMover: null,
    blackBidsTotal: 0,
    whiteBidsTotal: 0,
    blackTokenAtEnd: false,
  };

  let opening = 0;
  let safety = 1500;
  let prevHolder = s.initiativeHolder;

  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const holderBefore = s.initiativeHolder;
      let bidB: number, bidW: number;
      if (opening < OPENING_MOVES) {
        bidB = 0;
        bidW = 0;
        opening++;
      } else {
        bidB = decideBid({ state: s, color: 'BLACK', level: black }, rng);
        bidW = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      }
      stats.blackBidsTotal += bidB;
      stats.whiteBidsTotal += bidW;
      if (bidB === bidW) stats.tieBids++;
      if (bidB === 0 && bidW === 0) stats.zeroZeroBids++;
      if (bidB === 0 && bidW > 0 && holderBefore === 'BLACK') stats.reverseAuctionWins++;
      if (bidW === 0 && bidB > 0 && holderBefore === 'WHITE') stats.reverseAuctionWins++;
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      stats.bidTurns++;
      if (out.resolution.winner === 'BLACK')
        stats.paymentByBlack += out.resolution.payment;
      else stats.paymentByWhite += out.resolution.payment;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        let m;
        if (opening <= OPENING_MOVES) {
          const moves = legalMoves(s.board, mover);
          m = moves[Math.floor(rng() * moves.length)];
        } else {
          const lvl = mover === 'BLACK' ? black : white;
          m = decideMove(s, mover, lvl, rng);
        }
        s = applyPlacement(s, mover, m.row, m.col);
        if (s.initiativeHolder !== prevHolder) stats.tokenTransfers++;
        else stats.tokenStayed++;
        prevHolder = s.initiativeHolder;
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? black : white;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
      if (s.initiativeHolder !== prevHolder) stats.tokenTransfers++;
      else stats.tokenStayed++;
      prevHolder = s.initiativeHolder;
    } else if (s.phase === 'FINAL_MOVE') {
      stats.finalMover = s.initiativeHolder;
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl = s.initiativeHolder === 'BLACK' ? black : white;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
        if (s.initiativeHolder !== prevHolder) stats.tokenTransfers++;
        else stats.tokenStayed++;
        prevHolder = s.initiativeHolder;
      }
    }
    stats.turns++;
  }
  const stones = countStones(s.board);
  stats.blackStones = stones.BLACK;
  stats.whiteStones = stones.WHITE;
  stats.blackChipsLeft = s.players.BLACK.chips;
  stats.whiteChipsLeft = s.players.WHITE.chips;
  stats.endReason = s.endReason || 'BOTH_NO_MOVES';
  stats.blackTokenAtEnd = s.initiativeHolder === 'BLACK';
  if (stones.BLACK > stones.WHITE) stats.winnerColor = 'BLACK';
  else if (stones.WHITE > stones.BLACK) stats.winnerColor = 'WHITE';
  else if (stats.blackChipsLeft > stats.whiteChipsLeft) stats.winnerColor = 'BLACK';
  else if (stats.whiteChipsLeft > stats.blackChipsLeft) stats.winnerColor = 'WHITE';
  return stats;
}

function summarize(label: string, results: any[]) {
  const n = results.length;
  let bWins = 0,
    wWins = 0,
    draws = 0;
  let avgTokenTransfers = 0,
    avgTokenStayed = 0;
  let avgTieBids = 0,
    avgZeroZero = 0,
    avgReverseAuction = 0;
  let avgBidTurns = 0,
    avgTurns = 0;
  let exhausted = 0,
    bothNoMoves = 0;
  let totalPayBlack = 0,
    totalPayWhite = 0;
  let totalBidsBlack = 0,
    totalBidsWhite = 0;
  let blackHoldsTokenAtEnd = 0;
  let avgBlackChipsLeft = 0,
    avgWhiteChipsLeft = 0;
  let avgBlackStones = 0,
    avgWhiteStones = 0;
  for (const r of results) {
    if (r.winnerColor === 'BLACK') bWins++;
    else if (r.winnerColor === 'WHITE') wWins++;
    else draws++;
    avgTokenTransfers += r.tokenTransfers;
    avgTokenStayed += r.tokenStayed;
    avgTieBids += r.tieBids;
    avgZeroZero += r.zeroZeroBids;
    avgReverseAuction += r.reverseAuctionWins;
    avgBidTurns += r.bidTurns;
    avgTurns += r.turns;
    if (r.endReason === 'CHIPS_EXHAUSTED') exhausted++;
    else bothNoMoves++;
    totalPayBlack += r.paymentByBlack;
    totalPayWhite += r.paymentByWhite;
    totalBidsBlack += r.blackBidsTotal;
    totalBidsWhite += r.whiteBidsTotal;
    if (r.blackTokenAtEnd) blackHoldsTokenAtEnd++;
    avgBlackChipsLeft += r.blackChipsLeft;
    avgWhiteChipsLeft += r.whiteChipsLeft;
    avgBlackStones += r.blackStones;
    avgWhiteStones += r.whiteStones;
  }
  const fmt = (x: number) => (x / n).toFixed(2);
  const pct = (x: number) => ((x / n) * 100).toFixed(1) + '%';
  console.log(`\n=== ${label} (${n} games) ===`);
  console.log(
    `Win rate:    BLACK=${pct(bWins)}  WHITE=${pct(wWins)}  DRAW=${pct(draws)}`
  );
  console.log(`Avg stones:  BLACK=${fmt(avgBlackStones)}  WHITE=${fmt(avgWhiteStones)}`);
  console.log(
    `Chips left:  BLACK=${fmt(avgBlackChipsLeft)}  WHITE=${fmt(avgWhiteChipsLeft)}`
  );
  console.log(
    `End reason:  CHIPS_EXHAUSTED=${pct(exhausted)}  BOTH_NO_MOVES=${pct(bothNoMoves)}`
  );
  console.log(`Avg turns:   total=${fmt(avgTurns)}  bid turns=${fmt(avgBidTurns)}`);
  const transferPct = (
    (avgTokenTransfers / Math.max(1, avgTokenStayed + avgTokenTransfers)) *
    100
  ).toFixed(0);
  console.log(
    `Token:       transfers=${fmt(avgTokenTransfers)}  stayed=${fmt(avgTokenStayed)}  ${transferPct}% transfer`
  );
  console.log(
    `Token@end:   BLACK=${pct(blackHoldsTokenAtEnd)}  WHITE=${pct(n - blackHoldsTokenAtEnd)}`
  );
  console.log(
    `Bidding:     tie bids=${fmt(avgTieBids)}  0-0 bids=${fmt(avgZeroZero)}  reverse auctions=${fmt(avgReverseAuction)}`
  );
  console.log(`Payment avg: BLACK=${fmt(totalPayBlack)}  WHITE=${fmt(totalPayWhite)}`);
  console.log(`Bid total:   BLACK=${fmt(totalBidsBlack)}  WHITE=${fmt(totalBidsWhite)}`);
  return { bWins, wWins, draws, n };
}

const allResults: any[] = [];
for (const chips of CHIP_OPTIONS) {
  for (const lvl of LEVELS) {
    const games: any[] = [];
    const N = 30;
    const t0 = Date.now();
    for (let s = 0; s < N; s++) {
      const stats = playOne(lvl, lvl, chips, s + 1);
      games.push(stats);
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const summary = summarize(`B=${lvl} W=${lvl} chips=${chips} (${elapsed}s)`, games);
    allResults.push({ black: lvl, white: lvl, chips, ...summary });
  }
}

console.log('\n=== Aggregate first-mover advantage ===');
let bAll = 0,
  wAll = 0,
  dAll = 0,
  nAll = 0;
for (const r of allResults) {
  bAll += r.bWins;
  wAll += r.wWins;
  dAll += r.draws;
  nAll += r.n;
}
console.log(`Total games: ${nAll}`);
console.log(`BLACK wins: ${bAll} (${((bAll / nAll) * 100).toFixed(1)}%)`);
console.log(`WHITE wins: ${wAll} (${((wAll / nAll) * 100).toFixed(1)}%)`);
console.log(`Draws:      ${dAll} (${((dAll / nAll) * 100).toFixed(1)}%)`);
