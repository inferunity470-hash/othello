import React from 'react';
import { FocusTrap } from './FocusTrap';

interface Props {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Tab', 'Shift+Tab'], description: 'フォーカス移動' },
  { keys: ['↑', '↓', '←', '→'], description: '盤面上のセルを移動' },
  { keys: ['Enter', 'Space'], description: '合法手のセルに着手' },
  { keys: ['Esc'], description: 'モーダルを閉じる' },
  { keys: ['B'], description: '入札パネルにフォーカス' },
  { keys: ['H'], description: 'ヒント (NPC 対戦時)' },
  { keys: ['M'], description: 'ヒートマップ切替' },
  { keys: ['?'], description: 'このヘルプを開く' },
];

/**
 * Shortcuts cheat-sheet, summoned with `?`. Read-only listing — actual
 * key handling lives in the components that own the relevant focus.
 */
export function ShortcutsOverlay({ onClose }: Props) {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-label="キーボードショートカット"
      onClick={onClose}
    >
      <FocusTrap onEscape={onClose} autoFocusSelector="button">
        <div
          className="overlay-card"
          style={{ maxWidth: 520 }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ marginTop: 0 }}>⌨ キーボードショートカット</h2>
          <table className="shortcuts">
            <tbody>
              {SHORTCUTS.map(s => (
                <tr key={s.description}>
                  <td>
                    {s.keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && ' / '}
                        <kbd>{k}</kbd>
                      </React.Fragment>
                    ))}
                  </td>
                  <td>{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button onClick={onClose}>閉じる (Esc)</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
