import { Color, GameOptions, GameResult, GameState, TurnRecord } from '../core/types';

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_BID'
  | 'ILLEGAL_MOVE'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_BID'
  | 'INTERNAL_ERROR';

export type ClientMsg =
  | { t: 'JOIN'; room: string; name: string; asColor?: Color | 'SPECTATE' }
  | { t: 'CREATE_ROOM'; name: string; options: GameOptions }
  | { t: 'BID'; amount: number }
  | { t: 'PLACE'; row: number; col: number }
  | { t: 'RESIGN' }
  | {
      /**
       * Request a rematch in the same room (only meaningful when the game
       * has ENDED). The first request just announces intent; once BOTH
       * players have requested, the server resets the room with the same
       * options (with colours swapped) and broadcasts the new state.
       */
      t: 'REMATCH';
    }
  | { t: 'CHAT'; text: string }
  | { t: 'PING' };

export interface PublicGameState extends Omit<GameState, 'pendingBids'> {
  pendingBids?: {
    BLACK?: number | 'HIDDEN';
    WHITE?: number | 'HIDDEN';
  };
}

export type ServerMsg =
  | { t: 'ROOM_CREATED'; room: string }
  | {
      t: 'JOINED';
      room: string;
      you: Color | 'SPECTATE';
      opponentName?: string;
    }
  | { t: 'STATE'; state: PublicGameState }
  | { t: 'BID_RECEIVED'; color: Color }
  | {
      t: 'BID_REVEAL';
      bids: { BLACK: number; WHITE: number };
      winner: Color;
      payment: number;
      /**
       * Per-player chip payment. Both non-zero in `all-pay` auctions.
       * Optional for backward compatibility; clients should fall back to
       * `{ [winner]: payment, [loser]: 0 }` when absent.
       */
      payments?: { BLACK: number; WHITE: number };
      tieBroken: boolean;
      /**
       * Initiative holder at resolution time. Useful for clients to message
       * whether the upcoming placement will transfer the token.
       */
      holderAtResolve: Color;
      /**
       * Phase the game enters right after resolution: 'PLACING' (bid winner
       * places), 'FINAL_MOVE' (holder places), or 'ENDED' (no further move).
       * Helps clients accurately describe the imminent token transfer.
       */
      nextPhase: 'PLACING' | 'FREE_MOVE' | 'FINAL_MOVE' | 'ENDED';
    }
  | {
      t: 'STONE_PLACED';
      mover: Color;
      row: number;
      col: number;
      flipped: Array<[number, number]>;
    }
  | { t: 'TURN_RECORDED'; record: TurnRecord }
  | { t: 'END'; result: GameResult }
  | {
      /**
       * Acknowledged when one player presses "rematch" while waiting on
       * the other. UI can show "Opponent wants a rematch" and prompt the
       * recipient to accept. When the second player also sends REMATCH,
       * the server starts a new game and broadcasts NEW_GAME instead.
       */
      t: 'REMATCH_REQUESTED';
      from: Color;
    }
  | {
      /**
       * Sent when both players agreed to rematch. Recipients should reset
       * their UI state and treat `you` as the new color (colours swap on
       * each rematch so neither side keeps the first-mover advantage).
       */
      t: 'NEW_GAME';
      you: Color | 'SPECTATE';
      opponentName?: string;
    }
  | { t: 'OPPONENT_DISCONNECTED'; graceSec: number }
  | { t: 'OPPONENT_RECONNECTED' }
  | { t: 'CHAT'; from: Color | 'SPECTATE'; text: string }
  | { t: 'ERROR'; code: ErrorCode; message: string }
  | { t: 'PONG' };

/**
 * Convert a full GameState into a PublicGameState for the given recipient.
 * Recipient's own pending bid is sent verbatim, opponent's is replaced with 'HIDDEN'.
 */
export function toPublicState(
  state: GameState,
  recipient: Color | 'SPECTATE'
): PublicGameState {
  const { pendingBids, ...rest } = state;
  if (!pendingBids) return rest;
  if (recipient === 'SPECTATE') {
    // Spectators see no bid amounts until reveal
    return {
      ...rest,
      pendingBids: {
        BLACK: pendingBids.BLACK == null ? undefined : 'HIDDEN',
        WHITE: pendingBids.WHITE == null ? undefined : 'HIDDEN',
      },
    };
  }
  const opp: Color = recipient === 'BLACK' ? 'WHITE' : 'BLACK';
  return {
    ...rest,
    pendingBids: {
      [recipient]: pendingBids[recipient],
      [opp]: pendingBids[opp] == null ? undefined : 'HIDDEN',
    } as any,
  };
}
