import { WebSocket, WebSocketServer } from 'ws';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop';
import { countStones, hasLegalMove } from '../src/core/board';
import { determineWinner } from '../src/core/scoring';
import { Color, GameOptions, GameState } from '../src/core/types';
import { ClientMsg, ServerMsg, toPublicState } from '../src/net/protocol';

const PORT = parseInt(process.env.PORT ?? '8787', 10);

interface PeerSlot {
  ws: WebSocket | null;
  name: string | null;
  connected: boolean;
}

interface Room {
  code: string;
  state: GameState;
  options: GameOptions;
  players: {
    BLACK: PeerSlot;
    WHITE: PeerSlot;
    SPECTATORS: PeerSlot[];
  };
}

const rooms = new Map<string, Room>();

function emptySlot(): PeerSlot {
  return { ws: null, name: null, connected: false };
}

function send(ws: WebSocket | null, msg: ServerMsg) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function peerSlots(room: Room): PeerSlot[] {
  const out: PeerSlot[] = [];
  if (room.players.BLACK.ws) out.push(room.players.BLACK);
  if (room.players.WHITE.ws) out.push(room.players.WHITE);
  for (const s of room.players.SPECTATORS) out.push(s);
  return out;
}

function broadcast(room: Room, msg: ServerMsg) {
  for (const p of peerSlots(room)) {
    if (p.connected) send(p.ws, msg);
  }
}

function broadcastState(room: Room) {
  for (const p of peerSlots(room)) {
    if (!p.connected) continue;
    const recipient: Color | 'SPECTATE' =
      p === room.players.BLACK
        ? 'BLACK'
        : p === room.players.WHITE
          ? 'WHITE'
          : 'SPECTATE';
    send(p.ws, { t: 'STATE', state: toPublicState(room.state, recipient) });
  }
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 1000; i++) {
    let s = '';
    for (let j = 0; j < 6; j++) {
      s += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(s)) return s;
  }
  throw new Error('cannot generate room code');
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
console.log(`[othello-bidding] WebSocket server listening on :${PORT}`);

wss.on('connection', ws => {
  let joinedCode: string | null = null;
  let myColor: Color | 'SPECTATE' | null = null;

  const reply = (msg: ServerMsg) => send(ws, msg);

  ws.on('message', raw => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      reply({ t: 'ERROR', code: 'INTERNAL_ERROR', message: 'BAD_JSON' });
      return;
    }
    try {
      handle(msg);
    } catch (err: any) {
      console.error('[server] handler error', err);
      reply({ t: 'ERROR', code: 'INTERNAL_ERROR', message: String(err?.message ?? err) });
    }
  });

  ws.on('close', () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const slot = peerSlots(room).find(p => p.ws === ws);
    if (slot) slot.connected = false;
    // Notify the active opponent if this disconnect concerned a player slot
    const opp =
      myColor === 'BLACK'
        ? room.players.WHITE
        : myColor === 'WHITE'
          ? room.players.BLACK
          : null;
    if (opp && opp.connected) {
      send(opp.ws, { t: 'OPPONENT_DISCONNECTED', graceSec: 60 });
    }
    if (peerSlots(room).every(p => !p.connected)) {
      rooms.delete(joinedCode);
    }
  });

  function handle(msg: ClientMsg) {
    if (msg.t === 'PING') return reply({ t: 'PONG' });

    if (msg.t === 'CREATE_ROOM') {
      const code = generateRoomCode();
      const state = initGame(msg.options ?? {});
      const room: Room = {
        code,
        options: state.options,
        state,
        players: {
          BLACK: { ws, name: msg.name ?? 'Player1', connected: true },
          WHITE: emptySlot(),
          SPECTATORS: [],
        },
      };
      rooms.set(code, room);
      joinedCode = code;
      myColor = 'BLACK';
      reply({ t: 'ROOM_CREATED', room: code });
      reply({ t: 'JOINED', room: code, you: 'BLACK' });
      broadcastState(room);
      return;
    }

    if (msg.t === 'JOIN') {
      const room = rooms.get(msg.room);
      if (!room) {
        return reply({
          t: 'ERROR',
          code: 'ROOM_NOT_FOUND',
          message: `部屋 ${msg.room} は存在しません`,
        });
      }
      let assigned: Color | 'SPECTATE';
      if (msg.asColor === 'SPECTATE') {
        assigned = 'SPECTATE';
        room.players.SPECTATORS.push({
          ws,
          name: msg.name ?? 'Spectator',
          connected: true,
        });
      } else if (!room.players.BLACK.connected) {
        assigned = 'BLACK';
        room.players.BLACK = { ws, name: msg.name ?? 'Player', connected: true };
      } else if (!room.players.WHITE.connected) {
        assigned = 'WHITE';
        room.players.WHITE = { ws, name: msg.name ?? 'Player', connected: true };
      } else {
        assigned = 'SPECTATE';
        room.players.SPECTATORS.push({
          ws,
          name: msg.name ?? 'Spectator',
          connected: true,
        });
      }
      joinedCode = room.code;
      myColor = assigned;
      const opp =
        assigned === 'BLACK'
          ? room.players.WHITE
          : assigned === 'WHITE'
            ? room.players.BLACK
            : null;
      reply({
        t: 'JOINED',
        room: room.code,
        you: assigned,
        opponentName: opp?.name ?? undefined,
      });
      if (opp && opp.connected) {
        send(opp.ws, { t: 'OPPONENT_RECONNECTED' });
      }
      broadcastState(room);
      return;
    }

    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room) {
      return reply({
        t: 'ERROR',
        code: 'ROOM_NOT_FOUND',
        message: 'No room joined',
      });
    }

    if (msg.t === 'BID') {
      if (myColor !== 'BLACK' && myColor !== 'WHITE') {
        return reply({
          t: 'ERROR',
          code: 'NOT_YOUR_TURN',
          message: '観戦者は入札できません',
        });
      }
      if (room.state.phase !== 'BIDDING') {
        return reply({
          t: 'ERROR',
          code: 'NOT_YOUR_TURN',
          message: `現在のフェーズは ${room.state.phase}`,
        });
      }
      if (room.state.pendingBids?.[myColor] != null) {
        return reply({
          t: 'ERROR',
          code: 'ALREADY_BID',
          message: '既に入札済み',
        });
      }
      try {
        room.state = setPendingBid(room.state, myColor, msg.amount | 0);
      } catch (e: any) {
        return reply({
          t: 'ERROR',
          code: 'INVALID_BID',
          message: String(e.message),
        });
      }
      broadcast(room, { t: 'BID_RECEIVED', color: myColor });
      if (
        room.state.pendingBids?.BLACK != null &&
        room.state.pendingBids?.WHITE != null
      ) {
        const out = resolvePendingBids(room.state);
        room.state = out.state;
        broadcast(room, {
          t: 'BID_REVEAL',
          bids: out.resolution.bids,
          winner: out.resolution.winner,
          payment: out.resolution.payment,
          payments: out.resolution.payments,
          tieBroken: out.resolution.tieBroken,
          holderAtResolve: out.state.initiativeHolder,
          nextPhase: out.state.phase as 'PLACING' | 'FREE_MOVE' | 'FINAL_MOVE' | 'ENDED',
        });
        const last = room.state.history[room.state.history.length - 1];
        if (last) broadcast(room, { t: 'TURN_RECORDED', record: last });
        if (room.state.phase === 'ENDED') {
          broadcast(room, { t: 'END', result: determineWinner(room.state) });
        }
      }
      broadcastState(room);
      return;
    }

    if (msg.t === 'PLACE') {
      if (myColor !== 'BLACK' && myColor !== 'WHITE') {
        return reply({
          t: 'ERROR',
          code: 'NOT_YOUR_TURN',
          message: 'spectator',
        });
      }
      // FINAL_MOVE auto-skip
      if (
        room.state.phase === 'FINAL_MOVE' &&
        !hasLegalMove(room.state.board, room.state.initiativeHolder)
      ) {
        room.state = skipFinalMoveIfNoLegal(room.state);
        broadcast(room, { t: 'END', result: determineWinner(room.state) });
        broadcastState(room);
        return;
      }
      const expected = expectedMover(room.state);
      if (expected !== myColor) {
        return reply({
          t: 'ERROR',
          code: 'NOT_YOUR_TURN',
          message: '相手の番です',
        });
      }
      try {
        room.state = applyPlacement(room.state, myColor, msg.row | 0, msg.col | 0);
      } catch (e: any) {
        return reply({
          t: 'ERROR',
          code: 'ILLEGAL_MOVE',
          message: String(e.message),
        });
      }
      const last = room.state.history[room.state.history.length - 1];
      broadcast(room, {
        t: 'STONE_PLACED',
        mover: myColor,
        row: msg.row | 0,
        col: msg.col | 0,
        flipped: last?.flipped ?? [],
        cornerBonusTo: last?.cornerBonusTo,
      });
      if (last) broadcast(room, { t: 'TURN_RECORDED', record: last });
      if (room.state.phase === 'ENDED') {
        broadcast(room, { t: 'END', result: determineWinner(room.state) });
      }
      broadcastState(room);
      return;
    }

    if (msg.t === 'CHAT') {
      broadcast(room, {
        t: 'CHAT',
        from: myColor!,
        text: String(msg.text ?? '').slice(0, 200),
      });
      return;
    }

    if (msg.t === 'RESIGN') {
      if (myColor !== 'BLACK' && myColor !== 'WHITE') return;
      const opp: Color = myColor === 'BLACK' ? 'WHITE' : 'BLACK';
      room.state = {
        ...room.state,
        phase: 'ENDED',
        endReason: 'BOTH_NO_MOVES',
        endedAt: Date.now(),
      };
      broadcast(room, {
        t: 'END',
        result: {
          winner: opp,
          stones: countStones(room.state.board),
          finalChips: {
            BLACK: room.state.players.BLACK.chips,
            WHITE: room.state.players.WHITE.chips,
          },
          endReason: 'BOTH_NO_MOVES',
          tieBreaker: 'NONE',
        },
      });
      broadcastState(room);
      return;
    }
  }
});
