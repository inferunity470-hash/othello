import {
  applyPlacement,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from './gameLoop';
import { GameOptions, GameState, TurnRecord, opponentOf } from './types';

/**
 * Replay a list of TurnRecords into a GameState.
 *
 * This is purely deterministic: given the same options and event log,
 * the resulting state is identical (timestamps aside, which we keep from
 * the records to preserve chronology).
 *
 * The format of each record:
 *  - phaseAtStart === 'BIDDING': bids + winner + payment + (mover, move) for placement
 *  - phaseAtStart === 'FREE_MOVE': mover + move
 *  - phaseAtStart === 'FINAL_MOVE': mover + move (or no move if skipped)
 */
export function replayEvents(options: GameOptions, events: TurnRecord[]): GameState {
  let state = initGame(options);
  for (const ev of events) {
    state = applyEvent(state, ev);
  }
  return state;
}

export function applyEvent(state: GameState, ev: TurnRecord): GameState {
  if (ev.phaseAtStart === 'BIDDING') {
    if (state.phase !== 'BIDDING') {
      throw new Error(
        `Replay mismatch: expected BIDDING, got ${state.phase} at turn ${ev.turnNo}`
      );
    }
    if (!ev.bids) throw new Error('BIDDING record missing bids');
    let s = setPendingBid(state, 'BLACK', ev.bids.BLACK);
    s = setPendingBid(s, 'WHITE', ev.bids.WHITE);
    const out = resolvePendingBids(s);
    s = out.state;
    // PLACING: the bid winner places, and the placement details were merged
    // into THIS record at turn-recording time. Apply now.
    if (s.phase === 'PLACING') {
      if (!ev.mover || !ev.move || ev.move === 'PASS') {
        throw new Error(
          `BIDDING record at turn ${ev.turnNo} missing mover/move after resolution to PLACING`
        );
      }
      s = applyPlacement(s, ev.mover, ev.move.row, ev.move.col);
    }
    // FINAL_MOVE / ENDED: the placement (if any) is recorded in the NEXT
    // event because applyPlacement creates a fresh TurnRecord for non-PLACING
    // phases. Nothing to do here — return so the next event handles it.
    return s;
  }
  if (ev.phaseAtStart === 'FREE_MOVE') {
    if (state.phase !== 'FREE_MOVE') {
      throw new Error(
        `Replay mismatch: expected FREE_MOVE, got ${state.phase} at turn ${ev.turnNo}`
      );
    }
    if (!ev.mover || !ev.move || ev.move === 'PASS') {
      throw new Error(`FREE_MOVE record missing mover/move at turn ${ev.turnNo}`);
    }
    return applyPlacement(state, ev.mover, ev.move.row, ev.move.col);
  }
  if (ev.phaseAtStart === 'FINAL_MOVE') {
    if (state.phase !== 'FINAL_MOVE') {
      throw new Error(
        `Replay mismatch: expected FINAL_MOVE, got ${state.phase} at turn ${ev.turnNo}`
      );
    }
    if (!ev.mover || !ev.move || ev.move === 'PASS') {
      // Holder has no legal move; skip
      return skipFinalMoveIfNoLegal(state);
    }
    return applyPlacement(state, ev.mover, ev.move.row, ev.move.col);
  }
  throw new Error(`Unknown phaseAtStart in record: ${ev.phaseAtStart}`);
}

/**
 * Truncate history to a given turn (1-indexed) and replay up to that point.
 * Useful for log click navigation.
 */
export function rewindTo(
  options: GameOptions,
  events: TurnRecord[],
  turnNo: number
): GameState {
  return replayEvents(options, events.slice(0, turnNo));
}

export { opponentOf };
