import { Color, GameState, opponentOf } from './types';

export interface BidResolution {
  winner: Color;
  payment: number;
  tieBroken: boolean;
  newInitiativeHolder: Color;
}

export function resolveBids(
  state: GameState,
  bids: { BLACK: number; WHITE: number }
): BidResolution {
  const second = state.options.auctionType === 'second-price';
  if (bids.BLACK > bids.WHITE) {
    // BLACK wins
    return {
      winner: 'BLACK',
      payment: second ? bids.WHITE : bids.BLACK,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  if (bids.WHITE > bids.BLACK) {
    // WHITE wins
    return {
      winner: 'WHITE',
      payment: second ? bids.BLACK : bids.WHITE,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  // Tie -> token holder wins, payment = both bids (they are equal).
  // Token transfers to opponent.
  const winner = state.initiativeHolder;
  return {
    winner,
    payment: bids[winner],
    tieBroken: true,
    newInitiativeHolder: opponentOf(winner),
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
