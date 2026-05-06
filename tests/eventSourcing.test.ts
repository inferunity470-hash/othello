import { describe, it, expect } from 'vitest';
import {
  initGame,
  applyPlacement,
  setPendingBid,
  resolvePendingBids,
} from '../src/core/gameLoop';
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
    expect(s.phase).toBeDefined();
    expect(after1.history).toHaveLength(1);
    expect(after1.players.BLACK.chips).toBe(170);
  });

  it('replay reproduces all-pay payment chain (both players lose chips)', () => {
    let s = initGame({ initialChips: 100, auctionType: 'all-pay' });
    // T1: BLACK 20 / WHITE 10  → BLACK wins, both pay
    s = playOneTurn(s, 20, 10);
    expect(s.players.BLACK.chips).toBe(80);
    expect(s.players.WHITE.chips).toBe(90);
    // T2: BLACK 5 / WHITE 30  → WHITE wins, both pay
    s = playOneTurn(s, 5, 30);
    expect(s.players.BLACK.chips).toBe(75);
    expect(s.players.WHITE.chips).toBe(60);
    // Replay must reconstruct identical chip totals
    const replayed = replayEvents(s.options, s.history);
    expect(replayed.players.BLACK.chips).toBe(s.players.BLACK.chips);
    expect(replayed.players.WHITE.chips).toBe(s.players.WHITE.chips);
    expect(replayed.board).toEqual(s.board);
    expect(replayed.initiativeHolder).toBe(s.initiativeHolder);
  });

  it('rewindTo at all-pay turn 1 has both players already debited', () => {
    let s = initGame({ initialChips: 100, auctionType: 'all-pay' });
    s = playOneTurn(s, 20, 10);
    s = playOneTurn(s, 5, 30);
    const afterT1 = rewindTo(s.options, s.history, 1);
    // Only T1 applied: BLACK -20, WHITE -10
    expect(afterT1.players.BLACK.chips).toBe(80);
    expect(afterT1.players.WHITE.chips).toBe(90);
  });
});
