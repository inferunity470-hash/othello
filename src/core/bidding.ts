import { Color, GameState, opponentOf } from './types';

export interface BidResolution {
  winner: Color;
  /**
   * The winner's payment (chips deducted from the winner). Kept for
   * backward compatibility with first-price / second-price callers.
   * For 'all-pay', equals `payments[winner]`.
   */
  payment: number;
  /**
   * Per-player payment in chips. The winner always has `payments[winner] > 0`;
   * the loser has `payments[loser] > 0` only for the `all-pay` auction,
   * otherwise 0.
   */
  payments: { BLACK: number; WHITE: number };
  tieBroken: boolean;
  /**
   * Initiative holder *as of right after bid resolution*.
   * Under the current rule, the token only moves at placement time
   * (when the current holder places a stone). Therefore this value
   * always equals `state.initiativeHolder` — the field is retained
   * for backward compatibility with TurnRecord serialization.
   */
  newInitiativeHolder: Color;
}

function paymentsFor(
  auctionType: GameState['options']['auctionType'],
  bids: { BLACK: number; WHITE: number },
  winner: Color
): { BLACK: number; WHITE: number } {
  const loser = opponentOf(winner);
  if (auctionType === 'all-pay') {
    // Both pay their own bid regardless of outcome.
    return { BLACK: bids.BLACK, WHITE: bids.WHITE };
  }
  if (auctionType === 'second-price') {
    // Winner pays loser's bid; loser pays nothing.
    const out: { BLACK: number; WHITE: number } = { BLACK: 0, WHITE: 0 };
    out[winner] = bids[loser];
    return out;
  }
  // first-price: winner pays own bid; loser pays nothing.
  const out: { BLACK: number; WHITE: number } = { BLACK: 0, WHITE: 0 };
  out[winner] = bids[winner];
  return out;
}

export function resolveBids(
  state: GameState,
  bids: { BLACK: number; WHITE: number }
): BidResolution {
  const auctionType = state.options.auctionType;
  let winner: Color;
  let tieBroken = false;
  if (bids.BLACK > bids.WHITE) {
    winner = 'BLACK';
  } else if (bids.WHITE > bids.BLACK) {
    winner = 'WHITE';
  } else {
    // Tied bids: the token holder wins the auction. The actual token move
    // happens later (at placement) per the placement-driven rule.
    winner = state.initiativeHolder;
    tieBroken = true;
  }
  const payments = paymentsFor(auctionType, bids, winner);
  return {
    winner,
    payment: payments[winner],
    payments,
    tieBroken,
    newInitiativeHolder: state.initiativeHolder,
  };
}

export function validateBid(
  amount: number,
  chips: number,
  minBid: number
): { ok: boolean; reason?: string } {
  if (!Number.isInteger(amount)) return { ok: false, reason: 'NOT_INTEGER' };
  if (amount < minBid) return { ok: false, reason: 'BELOW_MIN' };
  if (amount > chips) return { ok: false, reason: 'EXCEEDS_CHIPS' };
  return { ok: true };
}

export function currentMinBid(state: GameState): number {
  const limit = state.options.zeroBidStreakLimit;
  if (limit == null) return 0;
  return state.zeroBidStreak >= limit ? 1 : 0;
}
