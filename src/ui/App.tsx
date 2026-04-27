import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPlacement,
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
} from '../core/types';
import { hasLegalMove } from '../core/board';
import { BoardView } from './Board';
import { HUD } from './HUD';
import { BidPanel } from './BidPanel';
import { GameLog } from './GameLog';
import { HandoffOverlay } from './HandoffOverlay';
import { BidReveal } from './BidReveal';
import { ResultCard } from './ResultCard';
import { HelpOverlay } from './HelpOverlay';
import { Tour, shouldShowTour } from './Tour';
import { AILevel, decideBid, decideMove } from '../core/ai';
import { OnlineLobby } from './OnlineLobby';
import { saveGame, loadGame, clearSave, getPref, setPref } from './storage';

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
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(false);
  const [colorBlind, setColorBlind] = useState<boolean>(
    () => getPref('cb', 'off') === 'on'
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => getPref('motion', 'auto') === 'reduced'
  );

  // First-time tour
  useEffect(() => {
    if (shouldShowTour()) setTour(true);
  }, []);

  // Apply prefs to the document root
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.cb = colorBlind ? 'on' : 'off';
    setPref('cb', colorBlind ? 'on' : 'off');
  }, [colorBlind]);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
    setPref('motion', reducedMotion ? 'reduced' : 'auto');
  }, [reducedMotion]);

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="accent">⚫⚪</span> ビッド式オセロ
        </h1>
        <div className="row" style={{ gap: '0.4rem' }}>
          <button
            className={colorBlind ? 'primary' : 'ghost'}
            onClick={() => setColorBlind(b => !b)}
            aria-pressed={colorBlind}
            title="色覚配慮モード(高コントラスト・縁取り)"
          >
            🎨 色覚配慮
          </button>
          <button
            className={reducedMotion ? 'primary' : 'ghost'}
            onClick={() => setReducedMotion(m => !m)}
            aria-pressed={reducedMotion}
            title="アニメーションを抑える"
          >
            🐢 動き軽減
          </button>
          <button
            className="ghost"
            onClick={() => setTour(true)}
            aria-label="チュートリアル"
            title="チュートリアル"
          >
            🎓 ツアー
          </button>
          <button
            className="ghost"
            onClick={() => setHelp(true)}
            aria-label="ヘルプ"
          >
            ❓ ルール
          </button>
        </div>
      </header>
      <div className="subtitle">
        着手権を秘密入札で取り合う、戦略的オセロ。
      </div>
      <div style={{ height: '1rem' }} />
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
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {tour && <Tour onClose={() => setTour(false)} />}
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
        <label className="stack">
          <span>初期チップ</span>
          <input
            type="number"
            min={1}
            max={1000}
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
            min={0}
            max={100}
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
          <label className="stack">
            <span>NPC の色</span>
            <select
              value={aiColor}
              onChange={e => setAiColor(e.target.value as Color)}
            >
              <option value="WHITE">白(後手)</option>
              <option value="BLACK">黒(先手)</option>
            </select>
          </label>
          <label className="stack">
            <span>難易度</span>
            <select
              value={level}
              onChange={e => setLevel(e.target.value as AILevel)}
            >
              <option value="beginner">😊 初級 ― ランダム</option>
              <option value="intermediate">🙂 中級 ― 浅い探索</option>
              <option value="advanced">😎 上級 ― 深さ4 α-β</option>
              <option value="oni">😈 鬼 ― 終盤完全解析</option>
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
            ▶ 対局開始
          </button>
        )}
        {tab === 'ai' && (
          <button
            className="primary"
            onClick={() => onStart({ kind: 'vs-ai', options, aiColor, level })}
          >
            ▶ NPC と対局
          </button>
        )}
        {tab === 'online' && (
          <button
            className="primary"
            onClick={() => onStart({ kind: 'online' })}
          >
            ▶ ルーム選択へ
          </button>
        )}
      </div>

      <div className="muted">
        🪑 ホットシート:1台のPCを2人で交代して遊ぶ ・ 🤖 NPC:鬼難度は本気を出します
        ・ 🌐 オンライン:ルームコードで友達と。
      </div>
    </div>
  );
}

/* --------------------------- Hotseat --------------------------- */

interface LocalGameProps {
  options: GameOptions;
  onExit: () => void;
}

type Handoff =
  | { kind: 'idle' }
  | { kind: 'pre-bid'; color: Color }
  | { kind: 'pre-place' };

interface RevealData {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  tieBroken: boolean;
  /** Holder at resolve time — needed to message the placement-driven token transfer. */
  holderAtResolve: Color;
  /** Phase that resolution transitions into (PLACING / FINAL_MOVE / ENDED). */
  nextPhase: GameState['phase'];
}

function LocalGame({ options, onExit }: LocalGameProps) {
  // Try to restore a saved hotseat game; otherwise start fresh.
  const [state, setState] = useState<GameState>(() => {
    const saved = loadGame('hotseat');
    if (saved && saved.phase !== 'ENDED') return saved;
    return initGame(options);
  });
  const [bidStep, setBidStep] = useState<Color>(() => {
    // If we restored mid-bid, figure out who's up next.
    if (state.phase === 'BIDDING') {
      if (state.pendingBids?.BLACK == null) return 'BLACK';
      return 'WHITE';
    }
    return 'BLACK';
  });
  const [handoff, setHandoff] = useState<Handoff>(() =>
    state.phase === 'BIDDING'
      ? {
          kind: 'pre-bid',
          color: state.pendingBids?.BLACK == null ? 'BLACK' : 'WHITE',
        }
      : state.phase === 'PLACING' ||
        state.phase === 'FREE_MOVE' ||
        state.phase === 'FINAL_MOVE'
      ? { kind: 'pre-place' }
      : { kind: 'idle' }
  );
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [restored] = useState<boolean>(state.history.length > 0);

  // Auto-save on every state change (debounced via React batching).
  useEffect(() => {
    if (state.phase === 'ENDED') {
      clearSave('hotseat');
    } else {
      saveGame('hotseat', state);
    }
  }, [state]);

  const handleBid = (color: Color, amount: number) => {
    const next = setPendingBid(state, color, amount);
    setState(next);
    if (color === 'BLACK') {
      setBidStep('WHITE');
      setHandoff({ kind: 'pre-bid', color: 'WHITE' });
    } else {
      const out = resolvePendingBids(next);
      setState(out.state);
      setReveal({
        bids: out.resolution.bids,
        winner: out.resolution.winner,
        payment: out.resolution.payment,
        tieBroken: out.resolution.tieBroken,
        holderAtResolve: out.state.initiativeHolder,
        nextPhase: out.state.phase,
      });
      setBidStep('BLACK');
      // After reveal closes, show pre-place handoff if applicable
    }
  };

  const handleRevealClosed = () => {
    setReveal(null);
    if (
      state.phase === 'PLACING' ||
      state.phase === 'FREE_MOVE' ||
      state.phase === 'FINAL_MOVE'
    ) {
      setHandoff({ kind: 'pre-place' });
    } else if (state.phase === 'BIDDING') {
      setHandoff({ kind: 'pre-bid', color: 'BLACK' });
    } else {
      setHandoff({ kind: 'idle' });
    }
  };

  const handlePlace = (row: number, col: number) => {
    const mover = expectedMover(state);
    if (!mover) return;
    const next = applyPlacement(state, mover, row, col);
    setState(next);
    if (next.phase === 'BIDDING') {
      setHandoff({ kind: 'pre-bid', color: 'BLACK' });
    } else if (next.phase === 'FREE_MOVE' || next.phase === 'FINAL_MOVE') {
      setHandoff({ kind: 'pre-place' });
    } else {
      setHandoff({ kind: 'idle' });
    }
  };

  useEffect(() => {
    if (
      state.phase === 'FINAL_MOVE' &&
      !hasLegalMove(state.board, state.initiativeHolder)
    ) {
      setState(skipFinalMoveIfNoLegal(state));
    }
  }, [state.phase, state.initiativeHolder]);

  const placer = useMemo(() => expectedMover(state), [state]);

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
          showHeatmap={showHeatmap || state.phase === 'ENDED'}
        />
        <div className="row">
          <button onClick={onExit}>← ロビー</button>
          <button
            className={showHeatmap ? 'primary' : 'ghost'}
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            🔥 ヒートマップ {showHeatmap ? 'オフ' : 'オン'}
          </button>
          {state.phase === 'ENDED' && (
            <button
              className="primary"
              onClick={() => {
                clearSave('hotseat');
                setState(initGame(options));
                setBidStep('BLACK');
                setHandoff({ kind: 'pre-bid', color: 'BLACK' });
                setShowHeatmap(false);
              }}
            >
              🔄 新しい対局
            </button>
          )}
          {restored && state.phase !== 'ENDED' && (
            <span className="pill good" title="自動保存から復元">
              💾 復元済み
            </span>
          )}
        </div>
      </div>

      <div className="col">
        <HUD state={state} />
        {state.phase === 'BIDDING' && handoff.kind === 'idle' && !reveal && (
          <BidPanel
            state={state}
            color={bidStep}
            onSubmit={amount => handleBid(bidStep, amount)}
          />
        )}
        <GameLog state={state} />
        {state.phase === 'ENDED' && <ResultCard state={state} />}
      </div>

      {handoff.kind === 'pre-bid' && state.phase === 'BIDDING' && !reveal && (
        <HandoffOverlay
          title={`🔒 ${handoff.color === 'BLACK' ? '黒' : '白'} の番です`}
          description="プレイヤーが交代したら確認してください。相手に画面を見られないように。"
          buttonLabel="確認"
          onClick={() => setHandoff({ kind: 'idle' })}
        />
      )}
      {handoff.kind === 'pre-place' &&
        (state.phase === 'PLACING' ||
          state.phase === 'FREE_MOVE' ||
          state.phase === 'FINAL_MOVE') && (
          <HandoffOverlay
            title={`🎯 ${placer === 'BLACK' ? '黒' : '白'} の着手フェーズ`}
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

      {reveal && (
        <BidReveal
          bids={reveal.bids}
          winner={reveal.winner}
          payment={reveal.payment}
          tieBroken={reveal.tieBroken}
          holderAtResolve={reveal.holderAtResolve}
          nextPhase={reveal.nextPhase}
          onClose={handleRevealClosed}
        />
      )}
    </div>
  );
}

/* --------------------------- AI --------------------------- */

interface AIGameProps {
  options: GameOptions;
  aiColor: Color;
  level: AILevel;
  onExit: () => void;
}

function AIGame({ options, aiColor, level, onExit }: AIGameProps) {
  const slot = `vs-ai:${aiColor}:${level}`;
  const [state, setState] = useState<GameState>(() => {
    const saved = loadGame(slot);
    if (saved && saved.phase !== 'ENDED') return saved;
    return initGame(options);
  });
  const [thinking, setThinking] = useState(false);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [hint, setHint] = useState<{ row: number; col: number } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [restored] = useState<boolean>(state.history.length > 0);
  const humanColor: Color = aiColor === 'BLACK' ? 'WHITE' : 'BLACK';

  // Auto-save / clear on end
  useEffect(() => {
    if (state.phase === 'ENDED') {
      clearSave(slot);
    } else {
      saveGame(slot, state);
    }
  }, [state, slot]);

  // Clear hint whenever the state advances (it's stale).
  useEffect(() => {
    setHint(null);
  }, [state.history.length, state.phase]);
  // Latch to prevent StrictMode double-trigger from running AI logic twice
  // for the same logical state. Reset whenever phase or pendingBids change.
  const aiActedKeyRef = useRef<string | null>(null);

  // Build a dedup key for the current AI turn opportunity.
  const aiKey = (s: GameState): string =>
    `${s.history.length}|${s.phase}|${s.pendingBids?.BLACK ?? 'x'}|${
      s.pendingBids?.WHITE ?? 'x'
    }`;

  // AI driver: triggered whenever state changes; detects when AI must act.
  useEffect(() => {
    if (state.phase === 'ENDED') return;
    let cancelled = false;
    const tick = async () => {
      // BIDDING: AI bids only after human, then we resolve and reveal.
      if (state.phase === 'BIDDING') {
        if (state.pendingBids?.[aiColor] != null) return;
        if (state.pendingBids?.[humanColor] == null) return;
        const key = aiKey(state) + '|aiBid';
        if (aiActedKeyRef.current === key) return;
        aiActedKeyRef.current = key;
        setThinking(true);
        // Defer compute so the spinner can render
        await new Promise(r => setTimeout(r, 30));
        const aiAmount = decideBid({ state, color: aiColor, level });
        if (cancelled) return;
        const withAI = setPendingBid(state, aiColor, aiAmount);
        const out = resolvePendingBids(withAI);
        if (cancelled) return;
        setThinking(false);
        setReveal({
          bids: out.resolution.bids,
          winner: out.resolution.winner,
          payment: out.resolution.payment,
          tieBroken: out.resolution.tieBroken,
          holderAtResolve: out.state.initiativeHolder,
          nextPhase: out.state.phase,
        });
        setState(out.state);
        return;
      }
      // PLACING/FREE_MOVE/FINAL_MOVE: AI plays if it's its turn.
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
        const key = aiKey(state) + '|aiMove';
        if (aiActedKeyRef.current === key) return;
        aiActedKeyRef.current = key;
        setThinking(true);
        await new Promise(r => setTimeout(r, 60));
        const m = decideMove(state, aiColor, level);
        if (cancelled) return;
        const next = applyPlacement(state, aiColor, m.row, m.col);
        setThinking(false);
        setState(next);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [state, aiColor, level, humanColor]);

  // Auto-skip FINAL_MOVE when holder has no move (also for human's case)
  useEffect(() => {
    if (
      state.phase === 'FINAL_MOVE' &&
      !hasLegalMove(state.board, state.initiativeHolder)
    ) {
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
  const myTurnToBid =
    state.phase === 'BIDDING' && state.pendingBids?.[humanColor] == null;
  const myTurnToPlace =
    (state.phase === 'PLACING' ||
      state.phase === 'FREE_MOVE' ||
      state.phase === 'FINAL_MOVE') &&
    placer === humanColor;

  const requestHint = async () => {
    if (!myTurnToPlace || hintBusy) return;
    setHintBusy(true);
    // Defer compute so the spinner renders.
    await new Promise(r => setTimeout(r, 30));
    try {
      const m = decideMove(state, humanColor, level);
      setHint(m);
    } catch (err) {
      console.warn('hint failed', err);
    } finally {
      setHintBusy(false);
    }
  };

  return (
    <div className="game">
      <div className="board-wrap">
        <BoardView
          state={state}
          showLegalForColor={myTurnToPlace ? humanColor : null}
          onCellClick={handleHumanPlace}
          showHeatmap={showHeatmap || state.phase === 'ENDED'}
          hintCell={hint}
        />
        <div className="row">
          <button onClick={onExit}>← ロビー</button>
          <button
            className={showHeatmap ? 'primary' : 'ghost'}
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            🔥 ヒートマップ
          </button>
          {myTurnToPlace && (
            <button
              className="ghost"
              onClick={requestHint}
              disabled={hintBusy}
              title="同じ難度のAIにあなたの手番を1手だけ提案させる"
            >
              {hintBusy && <span className="spinner" />}
              💡 ヒント
            </button>
          )}
          {state.phase === 'ENDED' && (
            <button
              className="primary"
              onClick={() => {
                clearSave(slot);
                setState(initGame(options));
                aiActedKeyRef.current = null;
                setShowHeatmap(false);
                setHint(null);
              }}
            >
              🔄 もう一局
            </button>
          )}
          {restored && state.phase !== 'ENDED' && (
            <span className="pill good" title="自動保存から復元">
              💾 復元済み
            </span>
          )}
          <span className="muted" style={{ marginLeft: 'auto' }}>
            あなた: {humanColor === 'BLACK' ? '⚫黒' : '⚪白'} ・ NPC: {aiColor === 'BLACK' ? '⚫黒' : '⚪白'}{' '}
            ({levelLabel(level)})
          </span>
        </div>
      </div>
      <div className="col">
        <HUD state={state} myColor={humanColor} />
        {myTurnToBid && !reveal && (
          <BidPanel state={state} color={humanColor} onSubmit={handleHumanBid} />
        )}
        {!myTurnToBid && state.phase === 'BIDDING' && !reveal && (
          <div className="bid-panel">
            <div>
              ✓ あなたは <strong>{state.pendingBids?.[humanColor]}</strong> を入札しました。
            </div>
            <div className="muted">
              {thinking && <span className="spinner" />}
              NPC が思考中...
            </div>
          </div>
        )}
        {(state.phase === 'PLACING' ||
          state.phase === 'FREE_MOVE' ||
          state.phase === 'FINAL_MOVE') &&
          placer === aiColor &&
          !reveal && (
            <div className="bid-panel">
              <div className="muted">
                {thinking && <span className="spinner" />}
                NPC ({aiColor === 'BLACK' ? '黒' : '白'}) が着手を考えています...
              </div>
            </div>
          )}
        <GameLog state={state} />
        {state.phase === 'ENDED' && (
          <ResultCard state={state} myColor={humanColor} />
        )}
      </div>
      {reveal && (
        <BidReveal
          bids={reveal.bids}
          winner={reveal.winner}
          payment={reveal.payment}
          tieBroken={reveal.tieBroken}
          holderAtResolve={reveal.holderAtResolve}
          nextPhase={reveal.nextPhase}
          onClose={() => setReveal(null)}
        />
      )}
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
