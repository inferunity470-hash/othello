import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../core/gameLoop';
import { Color, DEFAULT_OPTIONS, GameOptions, GameState } from '../core/types';
import { hasLegalMove } from '../core/board';
import { BoardView } from './Board';
import { HUD } from './HUD';
import { BidPanel } from './BidPanel';
import { GameLog } from './GameLog';
import { BidReveal } from './BidReveal';
import { ResultCard } from './ResultCard';
import { HelpOverlay } from './HelpOverlay';
import { Tour, shouldShowTour } from './Tour';
import { AILevel, decideBid, decideMove } from '../core/ai';
import { determineWinner } from '../core/scoring';
import { saveGame, loadGame, clearSave, getPref, setPref } from './storage';
import { recordGame } from './stats';
import { setEnabled as setSoundEnabled } from './sound';
import { useI18n } from '../i18n';

/**
 * Offline-only build: NPC games are the sole game mode. Hotseat and
 * online multiplayer are removed for this launch — see the
 * `claude/add-game-launch-guide-DPtLL` branch for the full version.
 */
type Mode =
  | { kind: 'lobby' }
  | {
      kind: 'vs-ai';
      options: GameOptions;
      aiColor: Color;
      level: AILevel;
    };

export function App() {
  const { locale, setLocale, t } = useI18n();
  const [mode, setMode] = useState<Mode>({ kind: 'lobby' });
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(false);
  const [colorBlind, setColorBlind] = useState<boolean>(
    () => getPref('cb', 'off') === 'on'
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => getPref('motion', 'auto') === 'reduced'
  );
  const [sound, setSound] = useState<boolean>(() => getPref('sound', 'on') !== 'off');

  // Sync sound preference with engine
  useEffect(() => {
    setSoundEnabled(sound);
    setPref('sound', sound ? 'on' : 'off');
  }, [sound]);

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
            className={sound ? 'primary' : 'ghost'}
            onClick={() => setSound(s => !s)}
            aria-pressed={sound}
            title="効果音"
          >
            {sound ? '🔊 音 ON' : '🔇 音 OFF'}
          </button>
          <button
            className="ghost"
            onClick={() => setTour(true)}
            aria-label="チュートリアル"
            title="チュートリアル"
          >
            🎓 ツアー
          </button>
          <button className="ghost" onClick={() => setHelp(true)} aria-label="ヘルプ">
            ❓ {t('rules')}
          </button>
          <button
            className="ghost"
            onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}
            aria-label={t('language')}
            title={t('language')}
          >
            🌐 {locale === 'ja' ? 'EN' : 'JA'}
          </button>
        </div>
      </header>
      <div className="subtitle">着手権を秘密入札で取り合う、戦略的オセロ。</div>
      <div style={{ height: '1rem' }} />
      {mode.kind === 'lobby' && <Lobby onStart={setMode} />}
      {mode.kind === 'vs-ai' && (
        <AIGame
          options={mode.options}
          aiColor={mode.aiColor}
          level={mode.level}
          onExit={() => setMode({ kind: 'lobby' })}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {tour && <Tour onClose={() => setTour(false)} />}
    </div>
  );
}

/* --------------------------- Lobby --------------------------- */

function Lobby({ onStart }: { onStart: (m: Mode) => void }) {
  const [options, setOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [aiColor, setAiColor] = useState<Color>('WHITE');
  const [level, setLevel] = useState<AILevel>('intermediate');

  return (
    <div className="lobby">
      <h2 style={{ margin: 0 }}>🤖 NPC と対局</h2>

      <div className="row">
        <button
          className="primary"
          style={{ fontSize: '1.05rem' }}
          onClick={() =>
            onStart({
              kind: 'vs-ai',
              options: { ...DEFAULT_OPTIONS },
              aiColor: 'WHITE',
              level: 'intermediate',
            })
          }
          title="200 チップ・オールペイ・中級 NPC で即対局"
        >
          ⚡ クイック対局 (中級 NPC)
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          まずはこれから。設定変更は下のフォームで。
        </span>
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
                zeroBidStreakLimit: v === '' ? null : Math.max(0, parseInt(v, 10) || 0),
              });
            }}
          />
        </label>
        <label className="stack" title="入札方式">
          <span>競売方式</span>
          <select
            value={options.auctionType}
            onChange={e =>
              setOptions({
                ...options,
                auctionType: e.target.value as GameOptions['auctionType'],
              })
            }
          >
            <option value="first-price">🪙 ファースト (落札者のみ支払い)</option>
            <option value="second-price">🎲 セカンド (Vickrey)</option>
            <option value="all-pay">💸 オールペイ (両者が入札額を失う)</option>
          </select>
        </label>
      </div>

      <div className="row">
        <label className="stack">
          <span>NPC の色</span>
          <select value={aiColor} onChange={e => setAiColor(e.target.value as Color)}>
            <option value="WHITE">白(後手)</option>
            <option value="BLACK">黒(先手)</option>
          </select>
        </label>
        <label className="stack">
          <span>難易度</span>
          <select value={level} onChange={e => setLevel(e.target.value as AILevel)}>
            <option value="beginner">😊 初級 ― ランダム</option>
            <option value="intermediate">🙂 中級 ― 浅い探索</option>
            <option value="advanced">😎 上級 ― 深さ4 α-β</option>
            <option value="oni">😈 鬼 ― 終盤完全解析</option>
          </select>
        </label>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="primary"
          onClick={() => onStart({ kind: 'vs-ai', options, aiColor, level })}
        >
          ▶ 対局開始
        </button>
      </div>

      <div className="muted">
        鬼難度は本気を出します。デフォルトのオールペイは「敗者も入札額を失う」ルールです。
      </div>
    </div>
  );
}

/* --------------------------- AI --------------------------- */

interface RevealData {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  /** Per-player chip payment. Both non-zero in `all-pay` auctions. */
  payments: { BLACK: number; WHITE: number };
  tieBroken: boolean;
  /** Holder at resolve time — needed to message the placement-driven token transfer. */
  holderAtResolve: Color;
  /** Phase that resolution transitions into (PLACING / FINAL_MOVE / ENDED). */
  nextPhase: GameState['phase'];
}

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
  // Guard against recording the same finished game twice (StrictMode
  // double effects, repeated state updates after ENDED).
  const recordedRef = useRef<boolean>(false);

  // Auto-save / clear on end + persist statistics once per game
  useEffect(() => {
    if (state.phase === 'ENDED') {
      clearSave(slot);
      if (!recordedRef.current) {
        recordedRef.current = true;
        recordGame(state, determineWinner(state), humanColor);
      }
    } else {
      saveGame(slot, state);
    }
  }, [state, slot, humanColor]);

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
          payments: out.resolution.payments,
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
                recordedRef.current = false;
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
            あなた: {humanColor === 'BLACK' ? '⚫黒' : '⚪白'} ・ NPC:{' '}
            {aiColor === 'BLACK' ? '⚫黒' : '⚪白'} ({levelLabel(level)})
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
              ✓ あなたは <strong>{state.pendingBids?.[humanColor]}</strong>{' '}
              を入札しました。
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
        {state.phase === 'ENDED' && <ResultCard state={state} myColor={humanColor} />}
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
