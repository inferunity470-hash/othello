import React, { useEffect, useMemo, useRef } from 'react';
import { Color, GameResult, GameState } from '../core/types';
import { determineWinner } from '../core/scoring';
import { play as playSound } from './sound';

interface Props {
  state: GameState;
  myColor?: Color | 'SPECTATE';
  result?: GameResult;
}

export function ResultCard({ state, myColor, result }: Props) {
  const r = result ?? determineWinner(state);
  const isWin = myColor && myColor !== 'SPECTATE' && r.winner === myColor;
  const isLoss =
    myColor && myColor !== 'SPECTATE' && r.winner !== 'DRAW' && r.winner !== myColor;

  // Play exactly one end-of-game sound when this card mounts.
  const playedRef = useRef(false);
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    if (r.winner === 'DRAW') playSound('gameDraw');
    else if (myColor === 'SPECTATE' || myColor == null) playSound('gameWin');
    else playSound(isWin ? 'gameWin' : 'gameLose');
  }, [r.winner, myColor, isWin]);

  const confetti = useMemo(() => {
    if (r.winner === 'DRAW') return [];
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 2.5 + Math.random() * 1.6,
      color: pickConfettiColor(),
      size: 6 + Math.random() * 6,
    }));
  }, [r.winner]);

  return (
    <div className="bid-panel result" style={{ position: 'relative' }}>
      {r.winner !== 'DRAW' && (
        <div className="confetti" aria-hidden="true">
          {confetti.map(c => (
            <span
              key={c.id}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                width: `${c.size}px`,
                height: `${c.size * 1.6}px`,
              }}
            />
          ))}
        </div>
      )}
      <h2>
        {r.winner === 'DRAW'
          ? '🤝 引き分け'
          : isWin
          ? '🎉 勝利!'
          : isLoss
          ? '💧 敗北...'
          : `🏆 ${r.winner === 'BLACK' ? '黒' : '白'} の勝利`}
      </h2>
      <div className="score">
        <span className="black-num">⚫ {r.stones.BLACK}</span>
        <span className="sep">―</span>
        <span className="white-num">{r.stones.WHITE} ⚪</span>
      </div>
      <div className="muted">
        {r.endReason === 'BOTH_NO_MOVES' ? '両者合法手なし' : 'チップ枯渇'}
        {r.tieBreaker === 'STONES' && ' (石数同数 → 残チップで決着)'}
      </div>
      <div className="muted">
        残チップ:⚫ {r.finalChips.BLACK} ・ {r.finalChips.WHITE} ⚪
      </div>
    </div>
  );
}

function pickConfettiColor(): string {
  const colors = ['#f5b041', '#f7c873', '#2ecc71', '#4fc3f7', '#e74c3c', '#fff'];
  return colors[Math.floor(Math.random() * colors.length)];
}
