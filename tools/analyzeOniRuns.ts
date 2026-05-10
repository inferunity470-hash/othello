/**
 * Analyse oni-vs-oni self-play telemetry produced by `tools/oni1000.ts`.
 *
 * Usage: `npx tsx tools/analyzeOniRuns.ts <jsonl-path>`
 *
 * Reports:
 *  - Win rates (BLACK / WHITE / draws) and avg margins
 *  - Bid distribution by phase (open / mid / end), holder status
 *  - Per-phase mean / median / max bid magnitudes
 *  - Avg cost (chips spent) for the bid winner vs loser
 *  - Tied-bid frequency (how often did one side over-pay due to ties)
 *  - End-reason distribution
 *  - Bid-magnitude → game-outcome correlation (does bidding higher win?)
 */
import * as fs from 'fs';

interface BidRecord {
  turn: number;
  B: number;
  W: number;
  holderBefore: 'BLACK' | 'WHITE';
  winner: 'BLACK' | 'WHITE' | null;
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
  endReason: string | undefined;
  bids: BidRecord[];
}

const jsonlPath = process.argv[2];
if (!jsonlPath) {
  console.error('Usage: npx tsx tools/analyzeOniRuns.ts <path-to-jsonl>');
  process.exit(1);
}

const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
const games: GameRecord[] = lines.map(l => JSON.parse(l));
console.log(`Analysing ${games.length} games from ${jsonlPath}\n`);

// === Top-level outcomes ===
let blackWins = 0;
let whiteWins = 0;
let draws = 0;
let totalTurns = 0;
let totalDur = 0;
let wipeouts = 0;
const margins: number[] = [];
const endReasons: Record<string, number> = {};
for (const g of games) {
  if (g.blackStones > g.whiteStones) blackWins++;
  else if (g.whiteStones > g.blackStones) whiteWins++;
  else draws++;
  margins.push(g.blackStones - g.whiteStones);
  totalTurns += g.turns;
  totalDur += g.durationMs;
  const er = g.endReason ?? 'unknown';
  endReasons[er] = (endReasons[er] ?? 0) + 1;
  if (g.bids.length === 0) wipeouts++;
}
margins.sort((a, b) => a - b);
const n = games.length;
console.log('=== Outcomes ===');
console.log(`  BLACK ${blackWins} (${((blackWins * 100) / n).toFixed(1)}%) | ` +
  `WHITE ${whiteWins} (${((whiteWins * 100) / n).toFixed(1)}%) | ` +
  `Draws ${draws} (${((draws * 100) / n).toFixed(1)}%)`);
console.log(`  Margin (B-W): mean ${(margins.reduce((a, b) => a + b, 0) / n).toFixed(1)}, ` +
  `median ${margins[Math.floor(n / 2)]}, p10 ${margins[Math.floor(n * 0.1)]}, ` +
  `p90 ${margins[Math.floor(n * 0.9)]}`);
console.log(`  Avg turns: ${(totalTurns / n).toFixed(1)}, ` +
  `avg dur: ${(totalDur / n / 1000).toFixed(1)}s`);
console.log(`  End reasons:`, endReasons);
console.log(`  Random-opening wipeouts (no bids): ${wipeouts} (${((wipeouts * 100) / n).toFixed(1)}%)`);

// === Bid statistics by phase ===
type PhaseKey = 'open' | 'mid' | 'end';
interface BidStats {
  count: number;
  bidsHolder: number[];
  bidsNonHolder: number[];
  ties: number;
  zeroBoth: number;
}
const phases: Record<PhaseKey, BidStats> = {
  open: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
  mid: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
  end: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
};
for (const g of games) {
  for (const b of g.bids) {
    const ph = phases[b.phase];
    ph.count++;
    const holderBid = b.holderBefore === 'BLACK' ? b.B : b.W;
    const nonHolderBid = b.holderBefore === 'BLACK' ? b.W : b.B;
    ph.bidsHolder.push(holderBid);
    ph.bidsNonHolder.push(nonHolderBid);
    if (b.B === b.W) {
      if (b.B === 0) ph.zeroBoth++;
      else ph.ties++;
    }
  }
}
function summary(arr: number[]): string {
  if (arr.length === 0) return 'n=0';
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = sorted[Math.floor(arr.length / 2)];
  const max = sorted[sorted.length - 1];
  return `n=${arr.length} mean=${mean.toFixed(1)} median=${median} max=${max}`;
}
console.log('\n=== Bid distribution by phase (holder vs non-holder) ===');
for (const ph of ['open', 'mid', 'end'] as PhaseKey[]) {
  const s = phases[ph];
  console.log(`  [${ph}] count=${s.count}`);
  console.log(`    holder    : ${summary(s.bidsHolder)}`);
  console.log(`    non-holder: ${summary(s.bidsNonHolder)}`);
  console.log(
    `    ties (>0): ${s.ties} (${((s.ties * 100) / Math.max(1, s.count)).toFixed(1)}%), ` +
      `both-zero: ${s.zeroBoth} (${((s.zeroBoth * 100) / Math.max(1, s.count)).toFixed(1)}%)`
  );
}

// === Bid-magnitude → outcome correlation ===
// Buckets the avg-bid (per game per side) and reports win rate.
console.log('\n=== Avg-bid → win-rate (per-game, per-side) ===');
interface SideStat {
  bidSum: number;
  bidCount: number;
  won: boolean;
}
const sideStats: SideStat[] = [];
for (const g of games) {
  if (g.bids.length === 0) continue;
  let bSum = 0;
  let wSum = 0;
  for (const b of g.bids) {
    bSum += b.B;
    wSum += b.W;
  }
  sideStats.push({ bidSum: bSum, bidCount: g.bids.length, won: g.blackStones > g.whiteStones });
  sideStats.push({ bidSum: wSum, bidCount: g.bids.length, won: g.whiteStones > g.blackStones });
}
const buckets = [0, 5, 10, 15, 20, 25, 30, 40, 60, 100];
const bucketCounts = new Map<number, { n: number; wins: number }>();
for (const ss of sideStats) {
  const avg = ss.bidSum / Math.max(1, ss.bidCount);
  let bucket = buckets[buckets.length - 1];
  for (const b of buckets) if (avg < b) { bucket = b; break; }
  const cur = bucketCounts.get(bucket) ?? { n: 0, wins: 0 };
  cur.n++;
  if (ss.won) cur.wins++;
  bucketCounts.set(bucket, cur);
}
for (const b of buckets) {
  const c = bucketCounts.get(b);
  if (!c) continue;
  console.log(`  avg-bid <${b}: n=${c.n}, wins=${c.wins} (${((c.wins * 100) / c.n).toFixed(1)}%)`);
}

// === Holder vs non-holder win-bid frequency ===
let holderBidWins = 0;
let nonHolderBidWins = 0;
let totalBids = 0;
for (const g of games) {
  for (const b of g.bids) {
    if (!b.winner) continue;
    totalBids++;
    if (b.winner === b.holderBefore) holderBidWins++;
    else nonHolderBidWins++;
  }
}
console.log('\n=== Bid-winner by holder status ===');
console.log(`  total bids with winner: ${totalBids}`);
console.log(`  holder won bid:     ${holderBidWins} (${((holderBidWins * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
console.log(`  non-holder won bid: ${nonHolderBidWins} (${((nonHolderBidWins * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
