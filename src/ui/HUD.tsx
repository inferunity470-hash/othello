import React from 'react';
import { Color, GameState } from '../core/types';
import { countStones } from '../core/board';
import { currentMinBid } from '../core/bidding';

interface Props {
  state: GameState;
  myColor?: Color | 'SPECTATE';
}

export function HUD({ state, myColor }: Props) {
  const stones = countStones(state.board);
  const total = state.options.initialChips || 1;
  const phaseText = phaseLabel(state, myColor);
  const minBid = currentMinBid(state);
  return (
    <div className="hud">
      <div className={`phase-banner ${phaseClass(state.phase)}`}>{phaseText}</div>
      <PlayerRow color="BLACK" state={state} stones={stones.BLACK} max={total} />
      <PlayerRow color="WHITE" state={state} stones={stones.WHITE} max={total} />
      <div className="muted">
        手番:{state.history.length + 1} ・ トークン保持:
        <span className="token-mark">
          {state.initiativeHolder === 'BLACK' ? '黒' : '白'}
        </span>
        {state.options.zeroBidStreakLimit != null && (
          <> ・ 連続0入札:{state.zeroBidStreak}/{state.options.zeroBidStreakLimit}</>
        )}
        {minBid > 0 && state.phase === 'BIDDING' && (
          <> ・ <strong>最小入札 {minBid}</strong> 強制中</>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  color,
  state,
  stones,
  max,
}: {
  color: Color;
  state: GameState;
  stones: number;
  max: number;
}) {
  const chips = state.players[color].chips;
  const pct = Math.min(100, Math.round((chips / max) * 100));
  return (
    <div className="player-row">
      <div className={`swatch ${color === 'BLACK' ? 'black' : 'white'}`} />
      <div>
        <div>
          {color === 'BLACK' ? '黒' : '白'} ・ 石 {stones} ・ チップ <strong>{chips}</strong>
          {state.initiativeHolder === color && (
            <span className="token-mark"> ★</span>
          )}
        </div>
        <div className="chip-bar" aria-hidden="true">
          <div className="chip-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div></div>
    </div>
  );
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

function phaseLabel(state: GameState, my?: Color | 'SPECTATE'): string {
  switch (state.phase) {
    case 'BIDDING':
      return '🎲 入札フェーズ';
    case 'RESOLVING':
      return '⚖️ 入札解決中';
    case 'PLACING': {
      const winner = state.history[state.history.length - 1]?.winner;
      const colorJP = winner === 'BLACK' ? '黒' : '白';
      const me = my === winner ? 'あなた' : '';
      return `🎯 ${colorJP}${me ? `(${me})` : ''}が着手`;
    }
    case 'FREE_MOVE': {
      // determine free mover
      return `🆓 無償着手`;
    }
    case 'FINAL_MOVE':
      return `🏁 最終1手 (保持者:${state.initiativeHolder === 'BLACK' ? '黒' : '白'})`;
    case 'ENDED':
      return '🏆 対局終了';
    default:
      return '';
  }
}
