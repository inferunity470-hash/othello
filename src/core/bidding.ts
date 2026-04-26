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
  if (bids.BLACK > bids.WHITE) {
    return {
      winner: 'BLACK',
      payment: bids.BLACK,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  if (bids.WHITE > bids.BLACK) {
    return {
      winner: 'WHITE',
      payment: bids.WHITE,
      tieBroken: false,
      newInitiativeHolder: state.initiativeHolder,
    };
  }
  // tie
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
