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
      tieBroken: boolean;
    }
  | {
      t: 'STONE_PLACED';
      mover: Color;
      row: number;
      col: number;
      flipped: Array<[number, number]>;
      cornerBonusTo?: Color;
    }
  | { t: 'TURN_RECORDED'; record: TurnRecord }
  | { t: 'END'; result: GameResult }
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
