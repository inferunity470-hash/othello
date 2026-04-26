import { describe, it, expect } from 'vitest';
import { initGame, applyPlacement, setPendingBid, resolvePendingBids } from '../src/core/gameLoop';
import { replayEvents, rewindTo } from '../src/core/events';
import { legalMoves } from '../src/core/board';
import { GameState } from '../src/core/types';

function playOneTurn(state: GameState, blackBid: number, whiteBid: number): GameState {
  let s = setPendingBid(state, 'BLACK', blackBid);
  s = setPendingBid(s, 'WHITE', whiteBid);
  const out = resolvePendingBids(s);
  s = out.state;
  if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
    const mover = out.resolution.winner;
    const m = legalMoves(s.board, mover)[0];
    if (!m) return s;
    s = applyPlacement(s, mover, m.row, m.col);
  }
  return s;
}

describe('event sourcing', () => {
  it('replayEvents reproduces a game from history', () => {
    let s = initGame();
    s = playOneTurn(s, 30, 20);
    s = playOneTurn(s, 5, 50);
    s = playOneTurn(s, 0, 0);

    const replayed = replayEvents(s.options, s.history);
    expect(replayed.board).toEqual(s.board);
    expect(replayed.players.BLACK.chips).toBe(s.players.BLACK.chips);
    expect(replayed.players.WHITE.chips).toBe(s.players.WHITE.chips);
    expect(replayed.initiativeHolder).toBe(s.initiativeHolder);
    expect(replayed.phase).toBe(s.phase);
  });

  it('rewindTo gives intermediate state', () => {
    let s = initGame();
    s = playOneTurn(s, 30, 20);
    const after1 = rewindTo(s.options, s.history, 1);
    s = playOneTurn(s, 5, 50);
    s = playOneTurn(s, 0, 0);

    expect(after1.history).toHaveLength(1);
    expect(after1.players.BLACK.chips).toBe(170);
  });
});
