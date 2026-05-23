/**
 * Measure the 鬼's win rate vs a fixed opponent level over many games.
 * Used to separate a real strength regression from the 4-game flakiness of
 * tests/oniStrength.test.ts.
 *
 * Usage: npx tsx tools/oniVsLevel.ts [level] [games] [chips]
 *   e.g. npx tsx tools/oniVsLevel.ts advanced 16 100
 *
 * Honours ONI_COUNTERMOVE / ONI_FUTILITY / ONI_SINGULAR from the environment,
 * so the caller can compare configurations:
 *   ONI_COUNTERMOVE=1 npx tsx tools/oniVsLevel.ts advanced 16 100
 *   ONI_COUNTERMOVE=0 npx tsx tools/oniVsLevel.ts advanced 16 100
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
import { hasLegalMove, countStones } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import { GameState } from '../src/core/types.ts';

function playGame(
  black: AILevel,
  white: AILevel,
  initialChips: number,
  seed: number
): GameState {
  ttClear();
  const rng = makeRng(seed);
  let s = initGame({ initialChips });
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      s = resolvePendingBids(s).state;
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
  return s;
}

const LEVEL = (process.argv[2] ?? 'advanced') as AILevel;
const N = parseInt(process.argv[3] ?? '16', 10);
const CHIPS = parseInt(process.argv[4] ?? '100', 10);
const cm = process.env.ONI_COUNTERMOVE ?? '(default off)';
const ts = process.env.ONI_TIME_SCALE ?? '1';
const evalCfg = process.env.ONI_EVAL_CFG ?? '';
console.log(
  `oni (CM=${cm}, time_scale=${ts}${evalCfg ? `, eval=${evalCfg}` : ''}) ` +
    `vs ${LEVEL}, ${N} games, chips=${CHIPS}`
);

let oniWins = 0;
let oppWins = 0;
let draws = 0;
let oniStoneTotal = 0;
let oppStoneTotal = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const oniBlack = i % 2 === 0;
  const s = playGame(
    oniBlack ? 'oni' : LEVEL,
    oniBlack ? LEVEL : 'oni',
    CHIPS,
    i * 7 + 3
  );
  const stones = countStones(s.board);
  const oni = oniBlack ? stones.BLACK : stones.WHITE;
  const opp = oniBlack ? stones.WHITE : stones.BLACK;
  oniStoneTotal += oni;
  oppStoneTotal += opp;
  if (oni > opp) oniWins++;
  else if (opp > oni) oppWins++;
  else draws++;
  console.log(
    `  game ${i + 1}/${N}: oni=${oniBlack ? 'B' : 'W'} oni=${oni} ${LEVEL}=${opp} ` +
      `(elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}
const winRate = oniWins / N;
console.log(
  `\nResult: oni ${oniWins} / draws ${draws} / ${LEVEL} ${oppWins}  ` +
    `win rate ${(winRate * 100).toFixed(1)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`
);
console.log(
  `avg stones: oni ${(oniStoneTotal / N).toFixed(1)} / ${LEVEL} ${(oppStoneTotal / N).toFixed(1)}`
);
