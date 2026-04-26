import React, { useEffect, useRef, useState } from 'react';
import { PartyClient, ConnectionStatus, defaultServerUrl } from '../net/partyClient';
import { ServerMsg, PublicGameState } from '../net/protocol';
import {
  Color,
  DEFAULT_OPTIONS,
  GameOptions,
  GameResult,
  GameState,
  TurnRecord,
} from '../core/types';
import { hasLegalMove } from '../core/board';
import { BoardView } from './Board';
import { HUD } from './HUD';
import { BidPanel } from './BidPanel';
import { GameLog } from './GameLog';
import { determineWinner } from '../core/scoring';

interface Props {
  onExit: () => void;
}

interface OnlineSession {
  client: PartyClient;
  room: string;
  you: Color | 'SPECTATE';
  opponentName?: string;
}

export function OnlineLobby({ onExit }: Props) {
  const [serverUrl, setServerUrl] = useState<string>(defaultServerUrl());
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [options, setOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [opponentBidIn, setOpponentBidIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<Array<{ from: Color | 'SPECTATE'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [opponentDown, setOpponentDown] = useState(false);

  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2200);
  };

  const startConnection = (
    onOpen: (client: PartyClient) => void
  ) => {
    setError(null);
    const client = new PartyClient(serverUrl, {
      onStatus: setStatus,
      onMessage: (msg: ServerMsg) => handleMessage(msg, client),
    });
    client.connect();
    const wait = setInterval(() => {
      if ((client as any).ws?.readyState === 1) {
        clearInterval(wait);
        onOpen(client);
      }
    }, 50);
    setTimeout(() => clearInterval(wait), 8000);
  };

  const handleMessage = (msg: ServerMsg, client: PartyClient) => {
    if (msg.t === 'ROOM_CREATED') {
      showToast(`部屋 ${msg.room} を作成しました。コードを共有してください。`);
      return;
    }
    if (msg.t === 'JOINED') {
      setSession({ client, room: msg.room, you: msg.you, opponentName: msg.opponentName });
      return;
    }
    if (msg.t === 'STATE') {
      setState(publicToLocal(msg.state));
      return;
    }
    if (msg.t === 'BID_RECEIVED') {
      // Mark opponent as having bid (color is whoever bid)
      // This is just informational; UI can show "相手が入札完了"
      setOpponentBidIn(true);
      return;
    }
    if (msg.t === 'BID_REVEAL') {
      const winnerJP = msg.winner === 'BLACK' ? '黒' : '白';
      showToast(
        `公開:黒${msg.bids.BLACK} 白${msg.bids.WHITE} → ${winnerJP}が${msg.payment}支払い${
          msg.tieBroken ? '(同額・トークン移動)' : ''
        }`
      );
      setOpponentBidIn(false);
      return;
    }
    if (msg.t === 'STONE_PLACED') {
      // Optional: animate flips
      return;
    }
    if (msg.t === 'TURN_RECORDED') {
      // Already updated by STATE
      return;
    }
    if (msg.t === 'END') {
      setResult(msg.result);
      return;
    }
    if (msg.t === 'OPPONENT_DISCONNECTED') {
      setOpponentDown(true);
      showToast(`相手の通信が切れました(猶予 ${msg.graceSec} 秒)`);
      return;
    }
    if (msg.t === 'OPPONENT_RECONNECTED') {
      setOpponentDown(false);
      showToast('相手が再接続しました');
      return;
    }
    if (msg.t === 'ERROR') {
      setError(`${msg.code}: ${msg.message}`);
      showToast(`エラー:${msg.message}`);
      return;
    }
    if (msg.t === 'CHAT') {
      setChatLog(l => [...l, { from: msg.from, text: msg.text }]);
      return;
    }
  };

  const handleCreateRoom = () => {
    startConnection(client => {
      client.send({ t: 'CREATE_ROOM', name, options });
    });
  };

  const handleJoinRoom = () => {
    if (!code) return;
    startConnection(client => {
      client.send({ t: 'JOIN', room: code.toUpperCase(), name });
    });
  };

  const handleBid = (amount: number) => {
    session?.client.send({ t: 'BID', amount });
  };

  const handlePlace = (row: number, col: number) => {
    session?.client.send({ t: 'PLACE', row, col });
  };

  const handleResign = () => {
    if (!confirm('投了しますか?')) return;
    session?.client.send({ t: 'RESIGN' });
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    session?.client.send({ t: 'CHAT', text: chatInput.trim() });
    setChatInput('');
  };

  // Disconnect cleanup on unmount
  useEffect(() => {
    return () => {
      session?.client.close();
    };
  }, [session]);

  // No session yet -> show join/create UI
  if (!session) {
    return (
      <div className="lobby">
        <h2>🌐 オンライン対戦</h2>
        <div className="muted">サーバURL(ローカル開発時は <code>ws://localhost:8787</code>)</div>
        <input
          type="text"
          value={serverUrl}
          onChange={e => setServerUrl(e.target.value)}
          placeholder="ws://..."
        />
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="あなたの名前(任意)"
        />
        <div className="row">
          <label>初期チップ
            <input
              type="number"
              value={options.initialChips}
              onChange={e =>
                setOptions({ ...options, initialChips: parseInt(e.target.value, 10) || 0 })
              }
            />
          </label>
          <label>角ボーナス
            <input
              type="number"
              value={options.cornerBonus}
              onChange={e =>
                setOptions({ ...options, cornerBonus: parseInt(e.target.value, 10) || 0 })
              }
            />
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={handleCreateRoom}>
            ルームを作成
          </button>
          <span className="muted">または</span>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="ルームコード"
            style={{ textTransform: 'uppercase' }}
          />
          <button className="primary" onClick={handleJoinRoom}>
            参加
          </button>
        </div>
        {status === 'connecting' && <div>接続中...</div>}
        {status === 'closed' && <div className="muted">未接続。サーバを起動していますか? (`npm run server`)</div>}
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <div className="row">
          <button onClick={onExit}>戻る</button>
        </div>
      </div>
    );
  }

  // Game in progress (or waiting for opponent)
  return (
    <div className="game">
      <div className="board-wrap">
        {state ? (
          <BoardView
            state={state}
            showLegalForColor={canPlace(state, session.you) ? (session.you as Color) : null}
            onCellClick={handlePlace}
            showHeatmap={state.phase === 'ENDED'}
          />
        ) : (
          <div className="bid-panel">対局開始を待機中...</div>
        )}
        <div className="row">
          <button onClick={() => { session.client.close(); onExit(); }}>退室</button>
          {session.you !== 'SPECTATE' && state?.phase !== 'ENDED' && (
            <button onClick={handleResign} style={{ background: 'var(--danger)' }}>
              投了
            </button>
          )}
          <span className="muted">
            ルーム <strong>{session.room}</strong> ・ あなた:{youLabel(session.you)}
            {opponentDown && ' ・ 相手切断中'}
          </span>
        </div>
      </div>
      <div className="col">
        {state && <HUD state={state} myColor={session.you} />}
        {state && session.you !== 'SPECTATE' && state.phase === 'BIDDING' && (
          (state.pendingBids?.[session.you as Color] == null) ? (
            <BidPanel state={state} color={session.you as Color} onSubmit={handleBid} />
          ) : (
            <div className="bid-panel">
              入札完了。相手の入札を待機中...
              {opponentBidIn && '相手も入札完了。集計中。'}
            </div>
          )
        )}
        {state && <GameLog state={state} />}
        {state?.phase === 'ENDED' && result && (
          <ResultCardForOnline result={result} />
        )}
        <ChatPanel
          chatLog={chatLog}
          onSend={handleSendChat}
          input={chatInput}
          setInput={setChatInput}
        />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function publicToLocal(s: PublicGameState): GameState {
  // pendingBids may include 'HIDDEN'; convert to undefined for the local-shape
  const pb = s.pendingBids;
  const sanitized: any = {};
  if (pb) {
    if (pb.BLACK !== undefined) sanitized.BLACK = pb.BLACK === 'HIDDEN' ? undefined : pb.BLACK;
    if (pb.WHITE !== undefined) sanitized.WHITE = pb.WHITE === 'HIDDEN' ? undefined : pb.WHITE;
  }
  return { ...(s as unknown as GameState), pendingBids: sanitized };
}

function canPlace(state: GameState, you: Color | 'SPECTATE'): boolean {
  if (you === 'SPECTATE') return false;
  if (state.phase !== 'PLACING' && state.phase !== 'FREE_MOVE' && state.phase !== 'FINAL_MOVE')
    return false;
  if (state.phase === 'PLACING') {
    const last = state.history[state.history.length - 1];
    return last?.winner === you;
  }
  if (state.phase === 'FINAL_MOVE') {
    return state.initiativeHolder === you;
  }
  // FREE_MOVE
  const legal = hasLegalMove(state.board, you);
  return legal;
}

function youLabel(y: Color | 'SPECTATE'): string {
  if (y === 'BLACK') return '黒';
  if (y === 'WHITE') return '白';
  return '観戦';
}

function ResultCardForOnline({ result }: { result: GameResult }) {
  return (
    <div className="bid-panel result">
      <h2>
        {result.winner === 'DRAW'
          ? '🤝 引き分け'
          : `🏆 ${result.winner === 'BLACK' ? '黒' : '白'}の勝利!`}
      </h2>
      <div className="score">
        黒 {result.stones.BLACK} ― {result.stones.WHITE} 白
      </div>
      <div className="muted">
        終局理由:
        {result.endReason === 'BOTH_NO_MOVES' ? '両者合法手なし' : 'チップ枯渇'}
        {result.tieBreaker === 'STONES' && ' (石数同数 → 残チップで決着)'}
      </div>
      <div className="muted">
        残チップ:黒 {result.finalChips.BLACK} ・ 白 {result.finalChips.WHITE}
      </div>
    </div>
  );
}

function ChatPanel({
  chatLog,
  onSend,
  input,
  setInput,
}: {
  chatLog: Array<{ from: Color | 'SPECTATE'; text: string }>;
  onSend: () => void;
  input: string;
  setInput: (s: string) => void;
}) {
  return (
    <div className="bid-panel">
      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>チャット</div>
      <div
        style={{
          maxHeight: '120px',
          overflowY: 'auto',
          fontSize: '0.85rem',
          background: 'var(--panel-2)',
          padding: '0.4rem',
          borderRadius: 4,
        }}
      >
        {chatLog.length === 0 && <span className="muted">まだメッセージはありません</span>}
        {chatLog.map((c, i) => (
          <div key={i}>
            <strong>
              {c.from === 'BLACK' ? '黒' : c.from === 'WHITE' ? '白' : '観'}:{' '}
            </strong>
            {c.text}
          </div>
        ))}
      </div>
      <div className="row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSend();
          }}
          style={{ flex: 1 }}
          placeholder="メッセージを入力"
        />
        <button onClick={onSend}>送信</button>
      </div>
    </div>
  );
}
