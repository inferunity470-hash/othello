import { GameResult, GameState } from './types';
import { countStones } from './board';

export function determineWinner(state: GameState): GameResult {
  const stones = countStones(state.board);
  const finalChips = {
    BLACK: state.players.BLACK.chips,
    WHITE: state.players.WHITE.chips,
  };
  const endReason = state.endReason ?? 'BOTH_NO_MOVES';

  if (stones.BLACK > stones.WHITE) {
    return { winner: 'BLACK', stones, finalChips, endReason, tieBreaker: 'NONE' };
  }
  if (stones.WHITE > stones.BLACK) {
    return { winner: 'WHITE', stones, finalChips, endReason, tieBreaker: 'NONE' };
  }
  // stones tie -> chips
  if (finalChips.BLACK > finalChips.WHITE) {
    return { winner: 'BLACK', stones, finalChips, endReason, tieBreaker: 'CHIPS' };
  }
  if (finalChips.WHITE > finalChips.BLACK) {
    return { winner: 'WHITE', stones, finalChips, endReason, tieBreaker: 'CHIPS' };
  }
  return { winner: 'DRAW', stones, finalChips, endReason, tieBreaker: 'NONE' };
}
