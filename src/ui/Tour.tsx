import React, { useEffect, useState } from 'react';
import { FocusTrap } from './FocusTrap';

interface Props {
  onClose: () => void;
}

const STEPS = [
  {
    title: '🎲 秘密入札で着手権を奪い合う',
    body: (
      <>
        各ターン、両者は <strong>同時に秘密入札</strong>{' '}
        します。高い金額を入札した方が勝ち、
        その額を支払って着手します。チップは支払うたびに <em>場へ消えて</em>、
        ゲームを通じて減り続けます。
      </>
    ),
  },
  {
    title: '★ トークン と 着手による移動',
    body: (
      <>
        同額入札時は <strong>先手権トークン保持者</strong> が勝ちます。 トークンは{' '}
        <strong>持っているプレイヤーが手を指すと相手に移動</strong> し、
        持っていないプレイヤーが手を指したときは <em>そのまま残ります</em>。
        つまり「直近で打っていない側」が常にトークンを保持する仕組みです。
      </>
    ),
  },
  {
    title: '🎯 打ちたくない手で逆オークション',
    body: (
      <>
        全ての手番が「権利」とは限りません。相手に角隣接を打たせたい局面では
        <strong>高額入札して相手に打たせる</strong> 逆オークションが成立します。
        <br />
        🔥 ヒートマップを見れば、どの局面でいくら賭けたかを後から振り返れます。
      </>
    ),
  },
];

export function Tour({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const lastStep = step === STEPS.length - 1;
  const cur = STEPS[step];

  useEffect(() => {
    // Mark as seen as soon as the user advances or closes
    return () => {
      try {
        localStorage.setItem('othello-bidding:tour-seen', '1');
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div className="overlay" role="dialog" aria-label="ツアー" onClick={onClose}>
      <FocusTrap onEscape={onClose} autoFocusSelector=".primary">
        <div
          className="overlay-card tour-card"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 480 }}
        >
          <div className="step-pill">
            STEP {step + 1} / {STEPS.length}
          </div>
          <h3>{cur.title}</h3>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.55 }}>{cur.body}</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button onClick={onClose} className="ghost">
              スキップ
            </button>
            <div className="row" style={{ gap: '0.4rem' }}>
              {step > 0 && <button onClick={() => setStep(s => s - 1)}>← 戻る</button>}
              {!lastStep ? (
                <button className="primary" onClick={() => setStep(s => s + 1)}>
                  次へ →
                </button>
              ) : (
                <button className="primary" onClick={onClose}>
                  ✓ 始める
                </button>
              )}
            </div>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem('othello-bidding:tour-seen') !== '1';
  } catch {
    return false;
  }
}
