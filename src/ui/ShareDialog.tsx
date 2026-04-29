import React, { useMemo, useState } from 'react';
import { GameState } from '../core/types';
import { encodeGameForUrl, exportGameJson, downloadGameJson } from '../core/serialize';
import { FocusTrap } from './FocusTrap';

interface Props {
  state: GameState;
  onClose: () => void;
}

/**
 * Sharing modal: produces a shareable URL (with the game state encoded
 * in the fragment) and a JSON download. The URL fragment keeps the
 * payload off any server logs while still being copy-pastable.
 */
export function ShareDialog({ state, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => buildShareUrl(state), [state]);
  const jsonText = useMemo(() => exportGameJson(state), [state]);

  const copyUrl = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="overlay"
      role="dialog"
      aria-label="共有"
      onClick={onClose}
    >
      <FocusTrap onEscape={onClose} autoFocusSelector="button">
        <div
          className="overlay-card"
          style={{ maxWidth: 600 }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ marginTop: 0 }}>📤 対局を共有</h2>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <label>
              <span className="muted">
                URL (フラグメント形式) — {url.length.toLocaleString()} 文字
                {url.length > 8000 && (
                  <span
                    className="pill warn"
                    style={{ marginLeft: '0.4rem' }}
                    title="一部のチャットアプリ等では長すぎる URL が切り詰められる可能性があります。JSONダウンロードを推奨。"
                  >
                    長すぎ?
                  </span>
                )}
              </span>
              <textarea
                readOnly
                value={url}
                rows={2}
                style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }}
                onFocus={e => e.currentTarget.select()}
              />
            </label>
            <div className="row">
              <button className="primary" onClick={copyUrl} disabled={!url}>
                {copied ? '✓ コピーしました' : '📋 URLをコピー'}
              </button>
              <button
                onClick={() => downloadGameJson(state, 'othello-bidding-game.json')}
              >
                💾 JSONダウンロード
              </button>
            </div>
            <details>
              <summary>JSON プレビュー</summary>
              <pre
                style={{
                  maxHeight: 220,
                  overflow: 'auto',
                  background: 'var(--panel-2)',
                  padding: '0.6rem',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                }}
              >
                {jsonText}
              </pre>
            </details>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              共有された URL を開くと盤面が再生され、ロビーから「インポート」で
              JSON を読み込めます。
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button onClick={onClose}>閉じる (Esc)</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function buildShareUrl(state: GameState): string {
  const code = encodeGameForUrl(state);
  if (typeof window === 'undefined') return `#g=${code}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#g=${code}`;
}
