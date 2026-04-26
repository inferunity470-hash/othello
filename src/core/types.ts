export type Color = 'BLACK' | 'WHITE';
export type Cell = Color | null;
export type Board = Cell[][];

export interface PlayerState {
  color: Color;
  chips: number;
}

export interface GameOptions {
  /**
   * Initial chip count. Number = symmetric, object = handicap (asymmetric).
   * Spec §17.1
   */
  initialChips: number | { BLACK: number; WHITE: number };
  cornerBonus: number;
  zeroBidStreakLimit: number | null;
  turnTimeoutSec: number | null;
  /**
   * Auction format. Default 'first-price' (winner pays own bid).
   * 'second-price' = Vickrey: winner pays loser's bid. Spec §17.6
   */
  auctionType: 'first-price' | 'second-price';
}

export type GamePhase =
  | 'BIDDING'
  | 'RESOLVING'
  | 'PLACING'
  | 'FREE_MOVE'
  | 'FINAL_MOVE'
  | 'ENDED';

export interface PendingBids {
  BLACK?: number;
  WHITE?: number;
}

export interface GameState {
  board: Board;
  players: Record<Color, PlayerState>;
  initiativeHolder: Color;
  phase: GamePhase;
  history: TurnRecord[];
  pendingBids?: PendingBids;
  lastMoveBy?: Color;
  zeroBidStreak: number;
  options: GameOptions;
  endReason?: 'BOTH_NO_MOVES' | 'CHIPS_EXHAUSTED';
  startedAt: number;
  endedAt?: number;
}

export interface TurnRecord {
  turnNo: number;
  phaseAtStart: GamePhase;
  bids?: { BLACK: number; WHITE: number };
  winner?: Color;
  tieBroken?: boolean;
  payment?: number;
  mover?: Color;
  move?: { row: number; col: number } | 'PASS';
  flipped?: Array<[number, number]>;
  cornerBonusTo?: Color;
  cornerBonusCount?: number;
  initiativeAfter: Color;
  chipsAfter: { BLACK: number; WHITE: number };
  timestamp: number;
}

export interface GameResult {
  winner: Color | 'DRAW';
  stones: { BLACK: number; WHITE: number };
  finalChips: { BLACK: number; WHITE: number };
  endReason: 'BOTH_NO_MOVES' | 'CHIPS_EXHAUSTED';
  tieBreaker?: 'STONES' | 'CHIPS' | 'NONE';
}

export const CONFIG = {
  BOARD_SIZE: 8,
  DEFAULT_INITIAL_CHIPS: 200,
  DEFAULT_CORNER_BONUS: 10,
  CORNER_SQUARES: [
    [0, 0],
    [0, 7],
    [7, 0],
    [7, 7],
  ] as const,
};

export const DEFAULT_OPTIONS: GameOptions = {
  initialChips: CONFIG.DEFAULT_INITIAL_CHIPS,
  cornerBonus: CONFIG.DEFAULT_CORNER_BONUS,
  zeroBidStreakLimit: null,
  turnTimeoutSec: null,
  auctionType: 'first-price',
};

export function initialChipsFor(opts: GameOptions, color: Color): number {
  return typeof opts.initialChips === 'number'
    ? opts.initialChips
    : opts.initialChips[color];
}

export function opponentOf(color: Color): Color {
  return color === 'BLACK' ? 'WHITE' : 'BLACK';
}
