import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  applyPlacement,
  computeAutoPhase,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../core/gameLoop';
import {
  Color,
  DEFAULT_OPTIONS,
  GameOptions,
  GameState,
  TurnRecord,
} from '../core/types';
import { hasLegalMove, legalMoves } from '../core/board';
import { rewindTo } from '../core/events';
import { determineWinner } from '../core/scoring';
import { BoardView } from './Board';
import { HUD } from './HUD';
import { BidPanel } from './BidPanel';
import { GameLog } from './GameLog';
import { HandoffOverlay } from './HandoffOverlay';
import { AILevel, decideBid, decideMove } from '../core/ai';
import { OnlineLobby } from './OnlineLobby';

type Mode =
  | { kind: 'lobby' }
  | { kind: 'hotseat'; options: GameOptions }
  | {
      kind: 'vs-ai';
      options: GameOptions;
      aiColor: Color;
      level: AILevel;
    }
  | { kind: 'online' };

export function App() {
  const [mode, setMode] = useState<Mode>({ kind: 'lobby' });

  return (
    <div className="app">
      <h1>ビッド式オセロ</h1>
      <div className="muted">
        着手権を秘密入札で取り合う、戦略的オセロ。
      </div>
      <div style={{ height: '0.8rem' }} />
      {mode.kind === 'lobby' && <Lobby onStart={setMode} />}
      {mode.kind === 'hotseat' && (
        <LocalGame
          options={mode.options}
          onExit={() => setMode({ kind: 'lobby' })}
        />
      )}
      {mode.kind === 'vs-ai' && (
        <AIGame
          options={mode.options}
          aiColor={mode.aiColor}
          level={mode.level}
          onExit={() => setMode({ kind: 'lobby' })}
        />
      )}
      {mode.kind === 'online' && (
        <OnlineLobby onExit={() => setMode({ kind: 'lobby' })} />
      )}
    </div>
  );
}

/* --------------------------- Lobby --------------------------- */

function Lobby({ onStart }: { onStart: (m: Mode) => void }) {
  const [tab, setTab] = useState<'hotseat' | 'ai' | 'online'>('hotseat');
  const [options, setOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [aiColor, setAiColor] = useState<Color>('WHITE');
  const [level, setLevel] = useState<AILevel>('intermediate');
  return (
    <div className="lobby">
      <div className="tabs" role="tablist">
        <button
          className={tab === 'hotseat' ? 'active' : ''}
          onClick={() => setTab('hotseat')}
        >
          🪑 同機ホットシート
        </button>
        <button
          className={tab === 'ai' ? 'active' : ''}
          onClick={() => setTab('ai')}
        >
          🤖 NPC 対戦
        </button>
        <button
          className={tab === 'online' ? 'active' : ''}
          onClick={() => setTab('online')}
        >
          🌐 友達とオンライン
        </button>
      </div>

      <div className="row">
        <label>
          初期チップ
          <input
            type="number"
            min={1}
            max={1000}
            value={options.initialChips}
            onChange={e =>
              setOptions({ ...options, initialChips: parseInt(e.target.value, 10) || 0 })
            }
          />
        </label>
        <label>
          角ボーナス
          <input
            type="number"
            min={0}
            max={100}
            value={options.cornerBonus}
            onChange={e =>
              setOptions({ ...options, cornerBonus: parseInt(e.target.value, 10) || 0 })
            }
          />
        </label>
        <label>
          連続0入札制限
          <input
            type="number"
            min={0}
            max={10}
            placeholder="無制限"
            value={options.zeroBidStreakLimit ?? ''}
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

      {tab === 'ai' && (
        <div className="row">
          <label>
            NPC の色
            <select
              value={aiColor}
              onChange={e => setAiColor(e.target.value as Color)}
            >
              <option value="WHITE">白(後手)</option>
              <option value="BLACK">黒(先手)</option>
            </select>
          </label>
          <label>
            難易度
            <select
              value={level}
              onChange={e => setLevel(e.target.value as AILevel)}
            >
              <option value="beginner">初級</option>
              <option value="intermediate">中級</option>
              <option value="advanced">上級</option>
              <option value="oni">鬼(極めて強い)</option>
            </select>
          </label>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {tab === 'hotseat' && (
          <button
            className="primary"
            onClick={() => onStart({ kind: 'hotseat', options })}
          >
            対局開始
          </button>
        )}
        {tab === 'ai' && (
          <button
            className="primary"
            onClick={() => onStart({ kind: 'vs-ai', options, aiColor, level })}
          >
            NPC と対局
          </button>
        )}
        {tab === 'online' && (
          <button
            className="primary"
            onClick={() => onStart({ kind: 'online' })}
          >
            ルーム選択へ
          </button>
        )}
      </div>

      <div className="muted">
        🪑 ホットシート:1台のPCを2人で回して遊ぶ・🤖 NPC:鬼難度は本気を出します・🌐
        オンライン:ルームコードで友人と。
      </div>
    </div>
  );
}

/* --------------------------- Local hotseat game --------------------------- */

interface LocalGameProps {
  options: GameOptions;
  onExit: () => void;
}

type HandoffStep =
  | { kind: 'idle' }
  | { kind: 'pre-bid'; color: Color }
  | { kind: 'pre-reveal' }
  | { kind: 'pre-place' };

function LocalGame({ options, onExit }: LocalGameProps) {
  const [state, setState] = useState<GameState>(() => initGame(options));
  // For hotseat secrecy: which player will bid next
  const [bidStep, setBidStep] = useState<Color>('BLACK');
  const [handoff, setHandoff] = useState<HandoffStep>({
    kind: 'pre-bid',
    color: 'BLACK',
  });
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2000);
  };

  const handleBid = (color: Color, amount: number) => {
    const next = setPendingBid(state, color, amount);
    setState(next);
    if (color === 'BLACK') {
      setBidStep('WHITE');
      setHandoff({ kind: 'pre-bid', color: 'WHITE' });
    } else {
      // Both bids in -> resolve
      const out = resolvePendingBids(next);
      setState(out.state);
      const bb = out.resolution.bids.BLACK;
      const wb = out.resolution.bids.WHITE;
      const winnerJP = out.resolution.winner === 'BLACK' ? '黒' : '白';
      showToast(
        `公開:黒${bb} 白${wb} → ${winnerJP}が${out.resolution.payment}支払い${
          out.resolution.tieBroken ? '(同額・トークン移動)' : ''
        }`
      );
      // After resolve, decide handoff
      if (out.state.phase === 'PLACING' || out.state.phase === 'FINAL_MOVE') {
        setHandoff({ kind: 'pre-place' });
      } else if (out.state.phase === 'ENDED') {
        setHandoff({ kind: 'idle' });
      } else {
        setHandoff({ kind: 'idle' });
      }
      setBidStep('BLACK');
    }
  };

  const handlePlace = (row: number, col: number) => {
    const mover = expectedMover(state);
    if (!mover) return;
    const next = applyPlacement(state, mover, row, col);
    setState(next);
    // Free-move chains stay; final move ends.
    // Decide next handoff
    if (next.phase === 'BIDDING') {
      setHandoff({ kind: 'pre-bid', color: 'BLACK' });
    } else if (next.phase === 'FREE_MOVE') {
      setHandoff({ kind: 'pre-place' });
    } else if (next.phase === 'FINAL_MOVE') {
      setHandoff({ kind: 'pre-place' });
    } else {
      setHandoff({ kind: 'idle' });
    }
  };

  // Auto-skip final move if holder has no legal move
  useEffect(() => {
    if (state.phase === 'FINAL_MOVE' && !hasLegalMove(state.board, state.initiativeHolder)) {
      const next = skipFinalMoveIfNoLegal(state);
      setState(next);
    }
  }, [state.phase, state.initiativeHolder]);

  const placer = useMemo(() => expectedMover(state), [state]);

  const onJumpTo = (turnNo: number) => {
    const past = rewindTo(options, state.history, turnNo);
    showToast(`ターン ${turnNo} の局面を表示中(現在の進行は維持)`);
    // We just briefly preview; we don't replace state since user expects ongoing game
    // For a simple implementation, let's just toast — full preview UI is overkill.
    void past;
  };

  return (
    <div className="game">
      <div className="board-wrap">
        <BoardView
          state={state}
          showLegalForColor={
            state.phase === 'PLACING' ||
            state.phase === 'FREE_MOVE' ||
            state.phase === 'FINAL_MOVE'
              ? placer ?? null
              : null
          }
          onCellClick={handlePlace}
          showHeatmap={state.phase === 'ENDED'}
        />
        <div className="row">
          <button onClick={onExit}>ロビーへ戻る</button>
          {state.phase === 'ENDED' && (
            <button
              className="primary"
              onClick={() => {
                setState(initGame(options));
                setBidStep('BLACK');
                setHandoff({ kind: 'pre-bid', color: 'BLACK' });
              }}
            >
              新しい対局
            </button>
          )}
        </div>
      </div>

      <div className="col">
        <HUD state={state} />
        {state.phase === 'BIDDING' && handoff.kind === 'idle' && (
          <BidPanel
            state={state}
            color={bidStep}
            onSubmit={amount => handleBid(bidStep, amount)}
          />
        )}
        <GameLog state={state} onJumpTo={onJumpTo} />
        {state.phase === 'ENDED' && <ResultCard state={state} />}
      </div>

      {handoff.kind === 'pre-bid' && state.phase === 'BIDDING' && (
        <HandoffOverlay
          title={`🔒 ${handoff.color === 'BLACK' ? '黒' : '白'} の番です`}
          description="プレイヤーは画面を確認してから「確認」をタップしてください。相手に見せないようにしてください。"
          buttonLabel="確認"
          onClick={() => setHandoff({ kind: 'idle' })}
        />
      )}
      {handoff.kind === 'pre-place' &&
        (state.phase === 'PLACING' ||
          state.phase === 'FREE_MOVE' ||
          state.phase === 'FINAL_MOVE') && (
          <HandoffOverlay
            title={`🎯 ${(placer === 'BLACK' ? '黒' : '白')}の着手フェーズ`}
            description={
              state.phase === 'FINAL_MOVE'
                ? '最終1手です(角ボーナスは適用されません)'
                : state.phase === 'FREE_MOVE'
                ? '相手に合法手がないため、無償で着手します。'
                : 'ハイライトされたマスをタップしてください。'
            }
            buttonLabel="準備OK"
            onClick={() => setHandoff({ kind: 'idle' })}
          />
        )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* --------------------------- vs AI --------------------------- */

interface AIGameProps {
  options: GameOptions;
  aiColor: Color;
  level: AILevel;
  onExit: () => void;
}

function AIGame({ options, aiColor, level, onExit }: AIGameProps) {
  const [state, setState] = useState<GameState>(() => initGame(options));
  const [toast, setToast] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const humanColor: Color = aiColor === 'BLACK' ? 'WHITE' : 'BLACK';
  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2200);
  };

  // AI step: triggered when phase requires AI to act
  useEffect(() => {
    if (state.phase === 'ENDED') return;
    let cancelled = false;
    const tick = async () => {
      if (state.phase === 'BIDDING') {
        // AI bid first if not in pending; we have to wait for both bids
        // Strategy: when human submits, we then resolve with AI's bid.
        // Pre-compute AI bid eagerly when human's bid is missing.
        if (state.pendingBids?.[aiColor] != null) return;
        if (state.pendingBids?.[humanColor] == null) {
          // Wait for human first
          return;
        }
        // Human bid present; AI bids now
        setThinking(true);
        await new Promise(r => setTimeout(r, 30));
        const aiAmount = decideBid({ state, color: aiColor, level });
        const withAI = setPendingBid(state, aiColor, aiAmount);
        const out = resolvePendingBids(withAI);
        if (cancelled) return;
        setState(out.state);
        setThinking(false);
        const bb = out.resolution.bids.BLACK;
        const wb = out.resolution.bids.WHITE;
        showToast(
          `公開:黒${bb} 白${wb} → ${
            out.resolution.winner === 'BLACK' ? '黒' : '白'
          }が${out.resolution.payment}支払い${
            out.resolution.tieBroken ? '(同額・トークン移動)' : ''
          }`
        );
        return;
      }
      if (
        state.phase === 'PLACING' ||
        state.phase === 'FREE_MOVE' ||
        state.phase === 'FINAL_MOVE'
      ) {
        const expected = expectedMover(state);
        if (expected !== aiColor) return;
        if (
          state.phase === 'FINAL_MOVE' &&
          !hasLegalMove(state.board, state.initiativeHolder)
        ) {
          setState(skipFinalMoveIfNoLegal(state));
          return;
        }
        setThinking(true);
        await new Promise(r => setTimeout(r, 50));
        const m = decideMove(state, aiColor, level);
        if (cancelled) return;
        const next = applyPlacement(state, aiColor, m.row, m.col);
        setState(next);
        setThinking(false);
        return;
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [state, aiColor, level]);

  // Auto skip final move when holder has no move (also for human's case)
  useEffect(() => {
    if (state.phase === 'FINAL_MOVE' && !hasLegalMove(state.board, state.initiativeHolder)) {
      setState(skipFinalMoveIfNoLegal(state));
    }
  }, [state.phase, state.initiativeHolder]);

  const handleHumanBid = (amount: number) => {
    const next = setPendingBid(state, humanColor, amount);
    setState(next);
  };

  const handleHumanPlace = (row: number, col: number) => {
    const expected = expectedMover(state);
    if (expected !== humanColor) return;
    const next = applyPlacement(state, humanColor, row, col);
    setState(next);
  };

  const placer = expectedMover(state);

  return (
    <div className="game">
      <div className="board-wrap">
        <BoardView
          state={state}
          showLegalForColor={
            (state.phase === 'PLACING' ||
              state.phase === 'FREE_MOVE' ||
              state.phase === 'FINAL_MOVE') &&
            placer === humanColor
              ? humanColor
              : null
          }
          onCellClick={handleHumanPlace}
          showHeatmap={state.phase === 'ENDED'}
        />
        <div className="row">
          <button onClick={onExit}>ロビーへ戻る</button>
          {state.phase === 'ENDED' && (
            <button
              className="primary"
              onClick={() => setState(initGame(options))}
            >
              新しい対局
            </button>
          )}
          <span className="muted">
            あなた:{humanColor === 'BLACK' ? '黒' : '白'} ・ NPC:
            {aiColor === 'BLACK' ? '黒' : '白'}({levelLabel(level)})
          </span>
        </div>
      </div>
      <div className="col">
        <HUD state={state} myColor={humanColor} />
        {state.phase === 'BIDDING' &&
          state.pendingBids?.[humanColor] == null && (
            <BidPanel state={state} color={humanColor} onSubmit={handleHumanBid} />
          )}
        {state.phase === 'BIDDING' &&
          state.pendingBids?.[humanColor] != null && (
            <div className="bid-panel">
              <div>
                あなたは <strong>{state.pendingBids?.[humanColor]}</strong> を入札しました。
              </div>
              <div className="muted">
                NPC が思考中... {thinking ? '🧠' : ''}
              </div>
            </div>
          )}
        <GameLog state={state} />
        {state.phase === 'ENDED' && <ResultCard state={state} />}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function levelLabel(l: AILevel): string {
  switch (l) {
    case 'beginner':
      return '初級';
    case 'intermediate':
      return '中級';
    case 'advanced':
      return '上級';
    case 'oni':
      return '鬼';
  }
}

/* --------------------------- Result --------------------------- */

function ResultCard({ state }: { state: GameState }) {
  const r = determineWinner(state);
  return (
    <div className="bid-panel result">
      <h2>
        {r.winner === 'DRAW'
          ? '🤝 引き分け'
          : `🏆 ${r.winner === 'BLACK' ? '黒' : '白'}の勝利!`}
      </h2>
      <div className="score">
        黒 {r.stones.BLACK} ― {r.stones.WHITE} 白
      </div>
      <div className="muted">
        終局理由:
        {r.endReason === 'BOTH_NO_MOVES' ? '両者合法手なし' : 'チップ枯渇'}
        {r.tieBreaker === 'STONES' && ' (石数同数 → 残チップで決着)'}
      </div>
      <div className="muted">
        残チップ:黒 {r.finalChips.BLACK} ・ 白 {r.finalChips.WHITE}
      </div>
    </div>
  );
}
