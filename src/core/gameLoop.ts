import {
  Color,
  DEFAULT_OPTIONS,
  GameOptions,
  GameState,
  PendingBids,
  TurnRecord,
  initialChipsFor,
  opponentOf,
} from './types';
import {
  applyMove,
  createInitialBoard,
  detectCornerGain,
  hasLegalMove,
  legalMoves,
} from './board';
import { currentMinBid, resolveBids, validateBid } from './bidding';

export function initGame(options?: Partial<GameOptions>): GameState {
  const opts: GameOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  const board = createInitialBoard();
  return {
    board,
    players: {
      BLACK: { color: 'BLACK', chips: initialChipsFor(opts, 'BLACK') },
      WHITE: { color: 'WHITE', chips: initialChipsFor(opts, 'WHITE') },
    },
    initiativeHolder: 'BLACK',
    phase: 'BIDDING',
    history: [],
    pendingBids: {},
    zeroBidStreak: 0,
    options: opts,
    startedAt: Date.now(),
  };
}

/**
 * Decide the next phase from board + chips alone, ignoring any pending bids.
 * Used after a placement OR at game initialization.
 *
 * Spec: BOTH_NO_MOVES > FREE_MOVE (legalB xor legalW) > ENDED (both at
 * 0 chips) > BIDDING.
 */
export function computeAutoPhase(state: GameState): GameState {
  if (state.phase === 'ENDED') return state;

  const legalB = hasLegalMove(state.board, 'BLACK');
  const legalW = hasLegalMove(state.board, 'WHITE');

  if (!legalB && !legalW) {
    return {
      ...state,
      phase: 'ENDED',
      endReason: 'BOTH_NO_MOVES',
      endedAt: Date.now(),
      pendingBids: {},
    };
  }
  if (legalB !== legalW) {
    return { ...state, phase: 'FREE_MOVE', pendingBids: {} };
  }
  // Both have legal moves. If neither can afford to bid, end the game
  // immediately — neither player should get a "free" final placement
  // when both are out of chips.
  if (state.players.BLACK.chips === 0 && state.players.WHITE.chips === 0) {
    return {
      ...state,
      phase: 'ENDED',
      endReason: 'CHIPS_EXHAUSTED',
      endedAt: Date.now(),
      pendingBids: {},
    };
  }
  return { ...state, phase: 'BIDDING', pendingBids: state.pendingBids ?? {} };
}

export function setPendingBid(state: GameState, color: Color, amount: number): GameState {
  if (state.phase !== 'BIDDING') {
    throw new Error(`Cannot bid in phase ${state.phase}`);
  }
  const minBid = currentMinBid(state);
  const v = validateBid(amount, state.players[color].chips, minBid);
  if (!v.ok) throw new Error(`Invalid bid for ${color}: ${v.reason}`);
  const pending: PendingBids = { ...(state.pendingBids ?? {}) };
  if (pending[color] != null) throw new Error(`${color} already bid this turn`);
  pending[color] = amount;
  return { ...state, pendingBids: pending };
}

export function bothBidsIn(state: GameState): boolean {
  return state.pendingBids?.BLACK != null && state.pendingBids?.WHITE != null;
}

export interface ResolveOutcome {
  state: GameState;
  resolution: {
    winner: Color;
    /** Winner's chip payment (back-compat alias for `payments[winner]`). */
    payment: number;
    /** Per-player chip payment. Both non-zero only for `all-pay` auctions. */
    payments: { BLACK: number; WHITE: number };
    tieBroken: boolean;
    bids: { BLACK: number; WHITE: number };
  };
}

/**
 * Apply bid resolution: deduct payment, swap initiative if tie,
 * then decide PLACING / FINAL_MOVE / ENDED accordingly.
 *
 * Spec §3.2:
 *   RESOLVING -> PLACING:    通常 (落札者に合法手あり)
 *   RESOLVING -> FINAL_MOVE: 支払い直後に両者0チップ、かつ保持者に合法手あり
 *   RESOLVING -> ENDED:      支払い直後に両者0チップ、かつ保持者に合法手なし
 */
export function resolvePendingBids(state: GameState): ResolveOutcome {
  if (state.phase !== 'BIDDING') throw new Error('Not in BIDDING phase');
  if (!bothBidsIn(state)) throw new Error('Both bids not in yet');
  const bids = {
    BLACK: state.pendingBids!.BLACK as number,
    WHITE: state.pendingBids!.WHITE as number,
  };
  const res = resolveBids(state, bids);
  const newPlayers = {
    BLACK: { ...state.players.BLACK },
    WHITE: { ...state.players.WHITE },
  };
  // Deduct payments per-player. For first-price / second-price, only the
  // winner's payment is non-zero; for all-pay, both players pay their bid.
  newPlayers.BLACK.chips -= res.payments.BLACK;
  newPlayers.WHITE.chips -= res.payments.WHITE;

  const bothZero = newPlayers.BLACK.chips === 0 && newPlayers.WHITE.chips === 0;
  // After bidding, board is unchanged, so both still have legal moves
  // (since BIDDING was entered only when both had moves).
  const winnerHasMove = hasLegalMove(state.board, res.winner);

  let phase: GameState['phase'];
  let endReason: GameState['endReason'] | undefined;
  if (bothZero) {
    // Both players are out of chips. End the game outright — neither
    // side should get a "free" final placement after a tie at zero.
    phase = 'ENDED';
    endReason = 'CHIPS_EXHAUSTED';
  } else if (winnerHasMove) {
    phase = 'PLACING';
  } else {
    // Should not normally happen since BIDDING required both have moves.
    phase = 'ENDED';
    endReason = 'BOTH_NO_MOVES';
  }

  const record: TurnRecord = {
    turnNo: state.history.length + 1,
    phaseAtStart: 'BIDDING',
    bids,
    winner: res.winner,
    tieBroken: res.tieBroken,
    payment: res.payment,
    initiativeAfter: res.newInitiativeHolder,
    chipsAfter: {
      BLACK: newPlayers.BLACK.chips,
      WHITE: newPlayers.WHITE.chips,
    },
    timestamp: Date.now(),
  };

  const zeroBidStreak =
    bids.BLACK === 0 && bids.WHITE === 0 ? state.zeroBidStreak + 1 : 0;

  const finalState: GameState = {
    ...state,
    players: newPlayers,
    initiativeHolder: res.newInitiativeHolder,
    phase,
    endReason,
    zeroBidStreak,
    pendingBids: {},
    history: [...state.history, record],
    lastMoveBy: undefined,
    endedAt: phase === 'ENDED' ? Date.now() : undefined,
  };

  return {
    state: finalState,
    resolution: {
      winner: res.winner,
      payment: res.payment,
      payments: res.payments,
      tieBroken: res.tieBroken,
      bids,
    },
  };
}

/**
 * Apply a stone placement to the current state.
 * Spec §6.5: corner bonus does NOT apply during FINAL_MOVE (§7.2).
 */
export function applyPlacement(
  state: GameState,
  mover: Color,
  row: number,
  col: number
): GameState {
  if (
    state.phase !== 'PLACING' &&
    state.phase !== 'FREE_MOVE' &&
    state.phase !== 'FINAL_MOVE'
  ) {
    throw new Error(`Cannot place in phase ${state.phase}`);
  }
  const expected = expectedMover(state);
  if (expected != null && expected !== mover) {
    throw new Error(`Expected ${expected} to move in phase ${state.phase}, got ${mover}`);
  }

  const before = state.board;
  const { newBoard, flipped } = applyMove(before, mover, row, col);

  const cornerCount = detectCornerGain(before, newBoard, mover);
  const applyBonus = state.phase !== 'FINAL_MOVE'; // §7.2 final move = no bonus
  const bonus = applyBonus ? cornerCount * state.options.cornerBonus : 0;
  const newPlayers = {
    BLACK: { ...state.players.BLACK },
    WHITE: { ...state.players.WHITE },
  };
  if (bonus > 0) newPlayers[mover].chips += bonus;

  // Initiative-token transfer rule:
  //   - If the mover currently holds the token, it transfers to the opponent.
  //   - If the mover does not hold the token, it stays with the current holder.
  // This applies uniformly to PLACING, FREE_MOVE, and FINAL_MOVE.
  const newInitiativeHolder =
    mover === state.initiativeHolder ? opponentOf(mover) : state.initiativeHolder;

  const history = state.history.slice();
  if (state.phase === 'PLACING') {
    // Attach to the most recent BIDDING record
    const idx = history.length - 1;
    const last = { ...history[idx] };
    last.mover = mover;
    last.move = { row, col };
    last.flipped = flipped;
    if (bonus > 0) {
      last.cornerBonusTo = mover;
      last.cornerBonusCount = cornerCount;
    }
    last.chipsAfter = {
      BLACK: newPlayers.BLACK.chips,
      WHITE: newPlayers.WHITE.chips,
    };
    last.initiativeAfter = newInitiativeHolder;
    history[idx] = last;
  } else {
    history.push({
      turnNo: history.length + 1,
      phaseAtStart: state.phase,
      mover,
      move: { row, col },
      flipped,
      cornerBonusTo: bonus > 0 ? mover : undefined,
      cornerBonusCount: bonus > 0 ? cornerCount : undefined,
      initiativeAfter: newInitiativeHolder,
      chipsAfter: {
        BLACK: newPlayers.BLACK.chips,
        WHITE: newPlayers.WHITE.chips,
      },
      timestamp: Date.now(),
    });
  }

  let nextState: GameState = {
    ...state,
    board: newBoard,
    players: newPlayers,
    initiativeHolder: newInitiativeHolder,
    history,
    lastMoveBy: mover,
  };

  if (state.phase === 'FINAL_MOVE') {
    return {
      ...nextState,
      phase: 'ENDED',
      endReason: 'CHIPS_EXHAUSTED',
      endedAt: Date.now(),
      pendingBids: {},
    };
  }

  // For PLACING and FREE_MOVE, recompute next phase from board+chips
  nextState = { ...nextState, phase: 'BIDDING', pendingBids: {} };
  return computeAutoPhase(nextState);
}

/**
 * In FINAL_MOVE the spec says the *initiative holder* plays. In FREE_MOVE
 * the player with the legal move plays. In PLACING the bid winner (= last
 * recorded turn's `winner`) plays.
 */
export function expectedMover(state: GameState): Color | null {
  if (state.phase === 'PLACING') {
    const last = state.history[state.history.length - 1];
    return last?.winner ?? null;
  }
  if (state.phase === 'FREE_MOVE') {
    const legalB = hasLegalMove(state.board, 'BLACK');
    const legalW = hasLegalMove(state.board, 'WHITE');
    if (legalB && !legalW) return 'BLACK';
    if (legalW && !legalB) return 'WHITE';
    return null;
  }
  if (state.phase === 'FINAL_MOVE') {
    return state.initiativeHolder;
  }
  return null;
}

/**
 * Skip a final move when holder has no legal move (E4 / E5).
 */
export function skipFinalMoveIfNoLegal(state: GameState): GameState {
  if (state.phase !== 'FINAL_MOVE') return state;
  if (hasLegalMove(state.board, state.initiativeHolder)) return state;
  return {
    ...state,
    phase: 'ENDED',
    endReason: 'CHIPS_EXHAUSTED',
    endedAt: Date.now(),
  };
}

export { legalMoves, hasLegalMove };
