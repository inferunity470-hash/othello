import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Color, GameResult, GameState } from '../core/types';
import { determineWinner } from '../core/scoring';
import { encodeGameForUrl } from '../core/serialize';
import { play as playSound } from './sound';

interface Props {
  state: GameState;
  myColor?: Color | 'SPECTATE';
  result?: GameResult;
}

function buildShareSummary(r: GameResult, myColor?: Color | 'SPECTATE'): string {
  const tag =
    r.winner === 'DRAW'
      ? '🤝 引き分け'
      : myColor && myColor !== 'SPECTATE' && r.winner === myColor
        ? '🎉 勝利!'
        : myColor && myColor !== 'SPECTATE'
          ? '😢 敗北'
          : r.winner === 'BLACK'
            ? '⚫ 黒の勝利'
            : '⚪ 白の勝利';
  return `ビッド式オセロ ${tag} ⚫${r.stones.BLACK} - ${r.stones.WHITE}⚪`;
}

export function ResultCard({ state, myColor, result }: Props) {
  const r = result ?? determineWinner(state);
  const isWin = myColor && myColor !== 'SPECTATE' && r.winner === myColor;
  const isLoss =
    myColor && myColor !== 'SPECTATE' && r.winner !== 'DRAW' && r.winner !== myColor;
  const [copied, setCopied] = useState<'url' | 'text' | null>(null);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const code = encodeGameForUrl(state);
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}#g=${code}`;
    } catch {
      return '';
    }
  }, [state]);
  const summary = buildShareSummary(r, myColor);

  const copyToClipboard = async (text: string, kind: 'url' | 'text') => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1600);
      }
    } catch {
      /* clipboard refused — silently fall through */
    }
  };

  const tryWebShare = async () => {
    const data: ShareData = {
      title: 'ビッド式オセロ',
      text: summary,
      url: shareUrl || undefined,
    };
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share(data);
        return;
      }
    } catch {
      /* user cancelled / unsupported — fall through to clipboard */
    }
    copyToClipboard(`${summary}\n${shareUrl}`, 'text');
  };

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

  // Full-screen end-of-game effect: gold burst on a win (or a decided game
  // without a viewpoint, e.g. hotseat/spectate), dark wash on a loss.
  const fxKind = r.winner === 'DRAW' ? null : isLoss ? 'lose' : 'win';
  const [fxActive, setFxActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFxActive(false), 2700);
    return () => clearTimeout(t);
  }, []);

  const fxConfetti = useMemo(() => {
    if (fxKind !== 'win') return [];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      duration: 1.6 + Math.random() * 1.2,
      color: pickConfettiColor(),
      size: 6 + Math.random() * 7,
    }));
  }, [fxKind]);

  const fxOverlay =
    fxActive && fxKind && typeof document !== 'undefined'
      ? createPortal(
          <div className={`endgame-fx ${fxKind}`} aria-hidden="true">
            {fxKind === 'win' ? (
              <>
                <div className="fx-flash" />
                <div className="fx-ring" />
                <div className="fx-confetti">
                  {fxConfetti.map(c => (
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
              </>
            ) : (
              <>
                <div className="fx-wash" />
                <div className="fx-vignette" />
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="bid-panel result" style={{ position: 'relative' }}>
      {fxOverlay}
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
      <div
        className="row"
        style={{ marginTop: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}
      >
        <button
          className="ghost"
          onClick={tryWebShare}
          title="結果と再現 URL を共有"
        >
          📤 共有
        </button>
        {shareUrl && (
          <button
            className="ghost"
            onClick={() => copyToClipboard(shareUrl, 'url')}
            title="この対局を再現できる URL をコピー"
          >
            {copied === 'url' ? '✓ URL コピー済み' : '🔗 リプレイ URL'}
          </button>
        )}
      </div>
    </div>
  );
}

function pickConfettiColor(): string {
  const colors = ['#f5b041', '#f7c873', '#2ecc71', '#4fc3f7', '#e74c3c', '#fff'];
  return colors[Math.floor(Math.random() * colors.length)];
}
