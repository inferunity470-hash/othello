import { Color, GameState, opponentOf } from './types';

export interface BidResolution {
  winner: Color;
  payment: number;
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

export function resolveBids(
  state: GameState,
  bids: { BLACK: number; WHITE: number }
): BidResolution {
  const second = state.options.auctionType === 'second-price';
  if (bids.BLACK > bids.WHITE) {
    return {
      winner: 'BLACK',
      payment: second ? bids.WHITE : bids.BLACK,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  if (bids.WHITE > bids.BLACK) {
    return {
      winner: 'WHITE',
      payment: second ? bids.BLACK : bids.WHITE,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  // Tied bids: the token holder wins the auction. The actual token move
  // happens later (at placement) per the placement-driven rule.
  const winner = state.initiativeHolder;
  return {
    winner,
    payment: bids[winner],
    tieBroken: true,
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
