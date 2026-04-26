import React, { useEffect, useRef, useState } from 'react';
import { Color, GameState, initialChipsFor } from '../core/types';
import { countStones } from '../core/board';
import { currentMinBid } from '../core/bidding';
import { expectedMover } from '../core/gameLoop';

interface Props {
  state: GameState;
  myColor?: Color | 'SPECTATE';
  rightAccessory?: React.ReactNode;
  showElapsed?: boolean;
}

export function HUD({ state, myColor, rightAccessory, showElapsed = true }: Props) {
  const stones = countStones(state.board);
  const mover = expectedMover(state);
  const minBid = currentMinBid(state);
  return (
    <div className="hud">
      <div className={`phase-banner ${phaseClass(state.phase)}`}>
        {phaseText(state, myColor)}
      </div>
      <PlayerCard
        color="BLACK"
        state={state}
        stones={stones.BLACK}
        max={initialChipsFor(state.options, 'BLACK')}
        active={isActive(state, 'BLACK', mover)}
        isMe={myColor === 'BLACK'}
      />
      <PlayerCard
        color="WHITE"
        state={state}
        stones={stones.WHITE}
        max={initialChipsFor(state.options, 'WHITE')}
        active={isActive(state, 'WHITE', mover)}
        isMe={myColor === 'WHITE'}
      />
      <div className="meta-row">
        <span className="pill">手番 {state.history.length + 1}</span>
        {showElapsed && (
          <span className="pill" title="対局経過時間">
            ⏱ <ElapsedTimer startedAt={state.startedAt} endedAt={state.endedAt} />
          </span>
        )}
        {state.options.zeroBidStreakLimit != null && (
          <span
            className={`pill ${
              state.zeroBidStreak >= state.options.zeroBidStreakLimit ? 'warn' : ''
            }`}
          >
            連続0入札 {state.zeroBidStreak}/{state.options.zeroBidStreakLimit}
          </span>
        )}
        {minBid > 0 && state.phase === 'BIDDING' && (
          <span className="pill warn">最小入札 {minBid}</span>
        )}
        {state.options.auctionType === 'second-price' && (
          <span className="pill">セカンドプライス</span>
        )}
        {rightAccessory}
      </div>
    </div>
  );
}

function isActive(state: GameState, color: Color, mover: Color | null): boolean {
  if (state.phase === 'BIDDING') return true;
  if (
    state.phase === 'PLACING' ||
    state.phase === 'FREE_MOVE' ||
    state.phase === 'FINAL_MOVE'
  )
    return mover === color;
  return false;
}

function PlayerCard({
  color,
  state,
  stones,
  max,
  active,
  isMe,
}: {
  color: Color;
  state: GameState;
  stones: number;
  max: number;
  active: boolean;
  isMe: boolean;
}) {
  const chips = state.players[color].chips;
  const pct = Math.min(100, Math.round((chips / Math.max(max, 1)) * 100));
  const hasToken = state.initiativeHolder === color;

  // Track chip changes to flash a delta indicator
  const prevChipsRef = useRef<number>(chips);
  const [delta, setDelta] = useState<number | null>(null);
  const [pulseClass, setPulseClass] = useState<string>('');
  useEffect(() => {
    const diff = chips - prevChipsRef.current;
    prevChipsRef.current = chips;
    if (diff !== 0) {
      setDelta(diff);
      setPulseClass(diff > 0 ? 'chip-pulse-up' : 'chip-pulse-down');
      const t = setTimeout(() => {
        setDelta(null);
        setPulseClass('');
      }, 900);
      return () => clearTimeout(t);
    }
  }, [chips]);

  return (
    <div
      className={`player-card ${active ? 'active' : ''}`}
      aria-label={`${color === 'BLACK' ? '黒' : '白'} 情報`}
    >
      <div className={`swatch ${color === 'BLACK' ? 'black' : 'white'}`}>
        {color === 'BLACK' ? '●' : '○'}
      </div>
      <div className="player-info">
        <div className="player-name">
          <span>
            {color === 'BLACK' ? '黒' : '白'}
            {isMe ? ' (あなた)' : ''}
          </span>
          {hasToken && (
            <span className="token" title="先手権トークン">
              ★トークン
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{stones} 石</span>
        </div>
        <div className="chip-row">
          <span style={{ minWidth: '3.2rem' }}>
            <strong className={pulseClass}>{chips}</strong> chip
            {delta != null && (
              <span className={`chip-delta ${delta > 0 ? 'plus' : 'minus'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </span>
          <div className="chip-bar" aria-hidden="true">
            <div className="chip-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ElapsedTimer({
  startedAt,
  endedAt,
}: {
  startedAt: number;
  endedAt?: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endedAt]);
  const ms = (endedAt ?? now) - startedAt;
  const secs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <>{`${m}:${String(s).padStart(2, '0')}`}</>;
}

function phaseClass(p: GameState['phase']): string {
  switch (p) {
    case 'BIDDING':
      return 'bidding';
    case 'PLACING':
    case 'FREE_MOVE':
      return 'placing';
    case 'FINAL_MOVE':
      return 'final';
    default:
      return '';
  }
}

function phaseText(state: GameState, my?: Color | 'SPECTATE'): string {
  switch (state.phase) {
    case 'BIDDING': {
      const myDone =
        my && my !== 'SPECTATE' ? state.pendingBids?.[my] != null : false;
      return myDone ? '🎲 入札済み — 相手を待機中' : '🎲 入札フェーズ';
    }
    case 'RESOLVING':
      return '⚖️ 入札解決中';
    case 'PLACING': {
      const winner = state.history[state.history.length - 1]?.winner;
      const colorJP = winner === 'BLACK' ? '黒' : '白';
      const me = my === winner ? '・あなた' : '';
      return `🎯 ${colorJP}${me} の着手`;
    }
    case 'FREE_MOVE':
      return '🆓 無償着手';
    case 'FINAL_MOVE':
      return `🏁 最終1手 (${state.initiativeHolder === 'BLACK' ? '黒' : '白'})`;
    case 'ENDED':
      return '🏆 対局終了';
    default:
      return '';
  }
}
