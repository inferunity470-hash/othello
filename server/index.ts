import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'node:http';
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
  /**
   * Color of the player who has currently requested a rematch (waiting
   * for the other to confirm). Cleared on game start. When the second
   * player also requests, the room is reset and this returns to null.
   */
  rematchRequestedBy: Color | null;
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

// Allowed origins for WebSocket upgrades. Set ALLOWED_ORIGINS to a
// comma-separated list (e.g. https://my-game.vercel.app,https://otherapp.com).
// When unset, allow any origin (development convenience). In production
// the env var should be set to lock the server to known clients.
const ALLOWED_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Per-connection rate limit: max messages per window
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 30;
// Max bytes per WS message (chats, bids, etc.). 4KB is plenty.
const MAX_MESSAGE_BYTES = 4096;

// Wrap the WS server in an HTTP server so platforms that health-check
// via plain HTTP (Render, Fly.io, Railway) can accept the deployment.
// `/health` and `/healthz` both return 200; `/` returns a brief status.
const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});
// `verifyClient` is invoked during the WS upgrade handshake so we can
// reject connections from unexpected origins before the socket opens.
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info: { origin: string; req: import('node:http').IncomingMessage }) => {
    if (ALLOWED_ORIGINS.length === 0) return true;
    const origin = info.origin ?? info.req.headers.origin;
    if (!origin) return false;
    return ALLOWED_ORIGINS.some(o => o === origin);
  },
  maxPayload: MAX_MESSAGE_BYTES,
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[othello-bidding] WebSocket server listening on :${PORT}`);
  if (ALLOWED_ORIGINS.length === 0) {
    console.log('[othello-bidding] ALLOWED_ORIGINS unset — accepting all origins');
  } else {
    console.log(`[othello-bidding] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  }
});

wss.on('connection', ws => {
  let joinedCode: string | null = null;
  let myColor: Color | 'SPECTATE' | null = null;
  // Sliding window rate limiter (timestamps of recent messages).
  const messageTimestamps: number[] = [];

  const reply = (msg: ServerMsg) => send(ws, msg);

  ws.on('message', raw => {
    // Enforce maximum message size (also enforced by `maxPayload` at
    // the protocol layer; this is a defense-in-depth check).
    const buf = raw as Buffer;
    if (buf.length > MAX_MESSAGE_BYTES) {
      reply({
        t: 'ERROR',
        code: 'INTERNAL_ERROR',
        message: 'Message too large',
      });
      return;
    }
    // Per-connection rate limit: drop messages exceeding N per window.
    const now = Date.now();
    while (
      messageTimestamps.length > 0 &&
      messageTimestamps[0] < now - RATE_LIMIT_WINDOW_MS
    ) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length >= RATE_LIMIT_MAX_PER_WINDOW) {
      reply({
        t: 'ERROR',
        code: 'INTERNAL_ERROR',
        message: 'Rate limit exceeded — slow down',
      });
      return;
    }
    messageTimestamps.push(now);

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
        rematchRequestedBy: null,
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

    // Re-derive myColor from the room's current player slots. This is
    // necessary because rematch swaps BLACK/WHITE so the color cached in
    // this connection's closure can become stale after a NEW_GAME.
    if (room.players.BLACK.ws === ws) myColor = 'BLACK';
    else if (room.players.WHITE.ws === ws) myColor = 'WHITE';
    else if (room.players.SPECTATORS.some(s => s.ws === ws)) myColor = 'SPECTATE';

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

    if (msg.t === 'REMATCH') {
      // Only meaningful after the game has ended; spectators can't request.
      if (room.state.phase !== 'ENDED') return;
      if (myColor !== 'BLACK' && myColor !== 'WHITE') return;

      // First request — record and notify the opponent.
      if (
        room.rematchRequestedBy === null ||
        room.rematchRequestedBy === myColor
      ) {
        room.rematchRequestedBy = myColor;
        broadcast(room, { t: 'REMATCH_REQUESTED', from: myColor });
        return;
      }

      // Second request from the OTHER player — reset the room and swap
      // colours so neither side keeps the first-mover advantage across
      // back-to-back games.
      const oldBlack = room.players.BLACK;
      const oldWhite = room.players.WHITE;
      room.players.BLACK = oldWhite;
      room.players.WHITE = oldBlack;
      room.state = initGame(room.options);
      room.rematchRequestedBy = null;

      // Each connected peer needs to know their NEW color before state
      // arrives. Send NEW_GAME individually with the recipient's color.
      const sendIndividualNewGame = (slot: PeerSlot, color: Color | 'SPECTATE') => {
        if (!slot.ws || !slot.connected) return;
        const oppName =
          color === 'BLACK'
            ? room.players.WHITE.name ?? undefined
            : color === 'WHITE'
              ? room.players.BLACK.name ?? undefined
              : undefined;
        send(slot.ws, { t: 'NEW_GAME', you: color, opponentName: oppName });
      };
      sendIndividualNewGame(room.players.BLACK, 'BLACK');
      sendIndividualNewGame(room.players.WHITE, 'WHITE');
      for (const s of room.players.SPECTATORS) {
        sendIndividualNewGame(s, 'SPECTATE');
      }
      // myColor will be re-derived from room.players on the next inbound
      // message in this connection (see the recompute block above).
      broadcastState(room);
      return;
    }
  }
});
