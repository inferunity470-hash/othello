import React, { useEffect, useRef, useState } from 'react';
import {
  PartyClient,
  ConnectionStatus,
  defaultServerUrl,
  isLikelyStaticHost,
} from '../net/partyClient';
import { ServerMsg, PublicGameState } from '../net/protocol';
import {
  Color,
  DEFAULT_OPTIONS,
  GameOptions,
  GameResult,
  GameState,
} from '../core/types';
import { hasLegalMove } from '../core/board';
import { BoardView } from './Board';
import { HUD } from './HUD';
import { BidPanel } from './BidPanel';
import { GameLog } from './GameLog';
import { BidReveal } from './BidReveal';
import { ResultCard } from './ResultCard';

interface Props {
  onExit: () => void;
}

interface Session {
  client: PartyClient;
  room: string;
  you: Color | 'SPECTATE';
  opponentName?: string;
}

interface RevealData {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  /** Per-player chip payment. Both non-zero in `all-pay`. */
  payments?: { BLACK: number; WHITE: number };
  tieBroken: boolean;
  /** Holder *at the moment of resolution* (i.e. before placement). */
  holderAtResolve: Color | null;
  nextPhase: 'PLACING' | 'FREE_MOVE' | 'FINAL_MOVE' | 'ENDED' | null;
}

export function OnlineLobby({ onExit }: Props) {
  const [serverUrl, setServerUrl] = useState<string>(defaultServerUrl());
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [options, setOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [opponentBidIn, setOpponentBidIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<
    Array<{ from: Color | 'SPECTATE'; text: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [opponentDown, setOpponentDown] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  /**
   * Whether *this* client has clicked 再戦 and is waiting on the opponent.
   * Cleared on NEW_GAME or whenever a fresh game state is received.
   */
  const [rematchPendingFromMe, setRematchPendingFromMe] = useState(false);
  /**
   * Color of the opponent who has requested a rematch (waiting on us).
   * null when no incoming request is pending. UI prompts the user to
   * accept or decline.
   */
  const [rematchPendingFromOpp, setRematchPendingFromOpp] = useState<Color | null>(
    null
  );

  const sessionRef = useRef<Session | null>(null);

  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2200);
  };

  const handleMessage = (msg: ServerMsg, client: PartyClient) => {
    if (msg.t === 'ROOM_CREATED') {
      showToast(`部屋 ${msg.room} を作成しました`);
      return;
    }
    if (msg.t === 'JOINED') {
      const newSession: Session = {
        client,
        room: msg.room,
        you: msg.you,
        opponentName: msg.opponentName,
      };
      sessionRef.current = newSession;
      setSession(newSession);
      // Remember enough to auto-rejoin if the WS drops and reconnects.
      // Without this, a transient disconnect leaves the server-side
      // `joinedCode` null and subsequent BID / PLACE messages return
      // ROOM_NOT_FOUND.
      client.setRejoinInfo({
        room: msg.room,
        name,
        asColor: msg.you,
      });
      return;
    }
    if (msg.t === 'STATE') {
      setState(publicToLocal(msg.state));
      return;
    }
    if (msg.t === 'BID_RECEIVED') {
      setOpponentBidIn(true);
      return;
    }
    if (msg.t === 'BID_REVEAL') {
      setReveal({
        bids: msg.bids,
        winner: msg.winner,
        payment: msg.payment,
        payments: msg.payments,
        tieBroken: msg.tieBroken,
        holderAtResolve: msg.holderAtResolve,
        nextPhase: msg.nextPhase,
      });
      setOpponentBidIn(false);
      return;
    }
    if (msg.t === 'STONE_PLACED') return;
    if (msg.t === 'TURN_RECORDED') return;
    if (msg.t === 'END') {
      setResult(msg.result);
      // A fresh game ended → rematch slate is clean.
      setRematchPendingFromMe(false);
      setRematchPendingFromOpp(null);
      return;
    }
    if (msg.t === 'REMATCH_REQUESTED') {
      // Server only forwards the OTHER player's request to us. (The
      // server doesn't echo our own request back.) Show the prompt.
      setRematchPendingFromOpp(msg.from);
      showToast(`${msg.from === 'BLACK' ? '黒' : '白'} が再戦を希望しています`);
      return;
    }
    if (msg.t === 'NEW_GAME') {
      // Both players agreed → server reset state and swapped colors.
      // Update session.you so HUD / BidPanel target the right side.
      const next: Session | null = sessionRef.current
        ? { ...sessionRef.current, you: msg.you, opponentName: msg.opponentName }
        : null;
      sessionRef.current = next;
      setSession(next);
      setResult(null);
      setReveal(null);
      setOpponentBidIn(false);
      setRematchPendingFromMe(false);
      setRematchPendingFromOpp(null);
      showToast('再戦を開始しました');
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
      showToast(`エラー: ${msg.message}`);
      return;
    }
    if (msg.t === 'CHAT') {
      setChatLog(l => [...l, { from: msg.from, text: msg.text }]);
      return;
    }
  };

  const startConnection = (onOpen: (client: PartyClient) => void) => {
    setError(null);
    const client = new PartyClient(serverUrl, {
      onStatus: setStatus,
      onMessage: msg => handleMessage(msg, client),
    });
    client.whenOpen(() => onOpen(client));
    client.connect();
  };

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }
    startConnection(client => {
      client.send({ t: 'CREATE_ROOM', name, options });
    });
  };

  const handleJoinRoom = () => {
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) {
      setError('ルームコードを入力してください');
      return;
    }
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }
    startConnection(client => {
      client.send({ t: 'JOIN', room: cleaned, name });
    });
  };

  const handleBid = (amount: number) => {
    sessionRef.current?.client.send({ t: 'BID', amount });
  };

  const handlePlace = (row: number, col: number) => {
    sessionRef.current?.client.send({ t: 'PLACE', row, col });
  };

  const handleResign = () => {
    if (!confirm('投了しますか?')) return;
    sessionRef.current?.client.send({ t: 'RESIGN' });
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sessionRef.current?.client.send({ t: 'CHAT', text: chatInput.trim() });
    setChatInput('');
  };

  const handleCopyCode = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.room);
      showToast(`コード ${session.room} をコピー`);
    } catch {
      showToast('コピーに失敗しました');
    }
  };

  const handleCopyShareLink = async () => {
    if (!session) return;
    try {
      const url = `${window.location.origin}/?room=${session.room}`;
      await navigator.clipboard.writeText(url);
      showToast('共有リンクをコピーしました');
    } catch {
      showToast('コピーに失敗しました');
    }
  };

  // Pre-fill from URL ?room=XXXXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (r) setCode(r);
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.client.close();
    };
  }, []);

  if (!session) {
    const showStaticNotice = isLikelyStaticHost();
    return (
      <div className="lobby">
        <h2>🌐 オンライン対戦</h2>
        {showStaticNotice && (
          <div
            className="muted"
            style={{
              background: 'var(--panel-2)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '0.6rem 0.8rem',
              fontSize: '0.88rem',
            }}
          >
            ⚠️ このサイトは静的ホスト (Vercel など) で配信されており、
            WebSocket サーバが同居していません。オンライン対戦には別途
            自前の WebSocket サーバが必要です:
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
              <li>
                ローカル: <code>npm run server</code> →{' '}
                <code>ws://localhost:8787</code>
              </li>
              <li>
                公開: Render / Fly / Railway 等で <code>server/index.ts</code>{' '}
                を起動 → 環境変数 <code>VITE_WS_URL</code> にその URL を設定して
                Vercel に再デプロイ
              </li>
            </ul>
          </div>
        )}
        <div className="row">
          <span className={`connection-status ${status}`}>
            <span className="dot" />
            {connectionLabel(status)}
          </span>
        </div>
        <label className="stack">
          <span>サーバ URL</span>
          <input
            type="text"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
            placeholder="ws://localhost:8787"
          />
        </label>
        <label className="stack">
          <span>あなたの名前</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例: しん"
            maxLength={24}
          />
        </label>
        <details>
          <summary className="muted">ゲームオプション (ルーム作成時)</summary>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <label className="stack">
              <span>初期チップ</span>
              <input
                type="number"
                value={
                  typeof options.initialChips === 'number'
                    ? options.initialChips
                    : options.initialChips.BLACK
                }
                onChange={e =>
                  setOptions({
                    ...options,
                    initialChips: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </label>
            <label className="stack">
              <span>角ボーナス</span>
              <input
                type="number"
                value={options.cornerBonus}
                onChange={e =>
                  setOptions({
                    ...options,
                    cornerBonus: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </label>
            <label className="stack">
              <span>連続0入札制限</span>
              <input
                type="number"
                value={options.zeroBidStreakLimit ?? ''}
                placeholder="無制限"
                onChange={e => {
                  const v = e.target.value;
                  setOptions({
                    ...options,
                    zeroBidStreakLimit:
                      v === '' ? null : Math.max(0, parseInt(v, 10) || 0),
                  });
                }}
              />
            </label>
          </div>
        </details>
        <div className="row">
          <button className="primary" onClick={handleCreateRoom}>
            ➕ ルーム作成
          </button>
          <span className="muted">または</span>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ルームコード"
            style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}
            maxLength={8}
          />
          <button className="primary" onClick={handleJoinRoom}>
            ▶ 参加
          </button>
        </div>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>⚠️ {error}</div>
        )}
        <div className="row">
          <button className="ghost" onClick={onExit}>
            ← 戻る
          </button>
          <span className="muted">
            ローカルで遊ぶ場合は別ターミナルで <code>npm run server</code> を起動。
          </span>
        </div>
      </div>
    );
  }

  // In-game view
  const myTurnToBid =
    state?.phase === 'BIDDING' &&
    session.you !== 'SPECTATE' &&
    state.pendingBids?.[session.you as Color] == null;
  const youAreSpec = session.you === 'SPECTATE';

  return (
    <div className="game">
      <div className="board-wrap">
        {state ? (
          <BoardView
            state={state}
            showLegalForColor={
              !youAreSpec && canPlace(state, session.you) ? (session.you as Color) : null
            }
            onCellClick={handlePlace}
            showHeatmap={showHeatmap || state.phase === 'ENDED'}
          />
        ) : (
          <div className="bid-panel">対局開始を待機中...</div>
        )}
        <div className="row">
          <button
            onClick={() => {
              sessionRef.current?.client.close();
              onExit();
            }}
          >
            ← 退室
          </button>
          {!youAreSpec && state?.phase !== 'ENDED' && (
            <button className="danger" onClick={handleResign}>
              🏳️ 投了
            </button>
          )}
          <button
            className={showHeatmap ? 'primary' : 'ghost'}
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            🔥 ヒートマップ
          </button>
          <span className={`connection-status ${status}`} style={{ marginLeft: 'auto' }}>
            <span className="dot" />
            {opponentDown ? '相手切断中' : connectionLabel(status)}
          </span>
        </div>

        <div className="room-code">
          <span className="muted">ルーム</span>
          <span className="code">{session.room}</span>
          <button className="ghost" onClick={handleCopyCode}>
            📋 コード
          </button>
          <button className="ghost" onClick={handleCopyShareLink}>
            🔗 リンク
          </button>
          <span className="muted">あなた: {youLabel(session.you)}</span>
        </div>
      </div>

      <div className="col">
        {state && <HUD state={state} myColor={session.you} />}
        {state && myTurnToBid && !reveal && (
          <BidPanel state={state} color={session.you as Color} onSubmit={handleBid} />
        )}
        {state &&
          state.phase === 'BIDDING' &&
          !youAreSpec &&
          state.pendingBids?.[session.you as Color] != null &&
          !reveal && (
            <div className="bid-panel">
              <div>
                ✓ あなたは <strong>{state.pendingBids?.[session.you as Color]}</strong>{' '}
                を入札しました。
              </div>
              <div className="muted">
                <span className="spinner" />
                {opponentBidIn ? '集計中...' : '相手の入札を待機中...'}
              </div>
            </div>
          )}
        {state && <GameLog state={state} />}
        {state?.phase === 'ENDED' && result && (
          <ResultCard state={state} result={result} myColor={session.you} />
        )}
        {state?.phase === 'ENDED' && !youAreSpec && (
          <div className="bid-panel" style={{ display: 'grid', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.95rem' }}>
              {rematchPendingFromOpp && rematchPendingFromOpp !== session.you ? (
                <>
                  🔁{' '}
                  <strong>
                    {rematchPendingFromOpp === 'BLACK' ? '黒' : '白'}
                  </strong>{' '}
                  が再戦を希望しています — 受ければ即座に新しい対局が始まります
                  (色は入れ替わります)。
                </>
              ) : rematchPendingFromMe ? (
                <>⏳ 相手の再戦応答を待っています...</>
              ) : (
                <>同じ部屋で再戦できます (色は入れ替わります)。</>
              )}
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={rematchPendingFromMe}
                onClick={() => {
                  sessionRef.current?.client.send({ t: 'REMATCH' });
                  setRematchPendingFromMe(true);
                  if (
                    rematchPendingFromOpp &&
                    rematchPendingFromOpp !== session.you
                  ) {
                    showToast('再戦を承諾しました');
                  } else {
                    showToast('相手に再戦を申請しました');
                  }
                }}
              >
                {rematchPendingFromOpp && rematchPendingFromOpp !== session.you
                  ? '✓ 再戦に同意'
                  : '🔁 再戦をリクエスト'}
              </button>
            </div>
          </div>
        )}
        <ChatPanel
          chatLog={chatLog}
          onSend={handleSendChat}
          input={chatInput}
          setInput={setChatInput}
        />
      </div>
      {reveal && (
        <BidReveal
          bids={reveal.bids}
          winner={reveal.winner}
          payment={reveal.payment}
          payments={reveal.payments}
          tieBroken={reveal.tieBroken}
          holderAtResolve={reveal.holderAtResolve}
          nextPhase={reveal.nextPhase}
          onClose={() => setReveal(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function publicToLocal(s: PublicGameState): GameState {
  const pb = s.pendingBids;
  const sanitized: any = {};
  if (pb) {
    if (pb.BLACK !== undefined)
      sanitized.BLACK = pb.BLACK === 'HIDDEN' ? undefined : pb.BLACK;
    if (pb.WHITE !== undefined)
      sanitized.WHITE = pb.WHITE === 'HIDDEN' ? undefined : pb.WHITE;
  }
  return { ...(s as unknown as GameState), pendingBids: sanitized };
}

function canPlace(state: GameState, you: Color | 'SPECTATE'): boolean {
  if (you === 'SPECTATE') return false;
  if (
    state.phase !== 'PLACING' &&
    state.phase !== 'FREE_MOVE' &&
    state.phase !== 'FINAL_MOVE'
  )
    return false;
  if (state.phase === 'PLACING') {
    const last = state.history[state.history.length - 1];
    return last?.winner === you;
  }
  if (state.phase === 'FINAL_MOVE') {
    return state.initiativeHolder === you;
  }
  // FREE_MOVE
  return hasLegalMove(state.board, you);
}

function youLabel(y: Color | 'SPECTATE'): string {
  if (y === 'BLACK') return '⚫黒';
  if (y === 'WHITE') return '⚪白';
  return '👁観戦';
}

function connectionLabel(s: ConnectionStatus): string {
  switch (s) {
    case 'idle':
      return '未接続';
    case 'connecting':
      return '接続中...';
    case 'open':
      return '接続中';
    case 'closed':
      return '切断';
  }
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [chatLog]);
  return (
    <div className="bid-panel">
      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>💬 チャット</div>
      <div className="chat-log" ref={ref}>
        {chatLog.length === 0 && (
          <span className="muted">まだメッセージはありません</span>
        )}
        {chatLog.map((c, i) => (
          <div key={i}>
            <span
              className={
                c.from === 'BLACK'
                  ? 'who-black'
                  : c.from === 'WHITE'
                    ? 'who-white'
                    : 'who-spec'
              }
            >
              {c.from === 'BLACK' ? '⚫' : c.from === 'WHITE' ? '⚪' : '👁'}
            </span>{' '}
            {c.text}
          </div>
        ))}
      </div>
      <div className="row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSend()}
          style={{ flex: 1 }}
          placeholder="メッセージを入力"
          maxLength={200}
        />
        <button onClick={onSend}>送信</button>
      </div>
    </div>
  );
}
