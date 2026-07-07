import React from 'react';
import { FocusTrap } from './FocusTrap';

interface Props {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: Props) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-label="ヘルプ">
      <FocusTrap onEscape={onClose} autoFocusSelector=".primary">
        <div className="overlay-card" onClick={e => e.stopPropagation()}>
          <h2>📖 ビッド式オセロ ルール</h2>
          <div className="help-content">
            <h3>基本</h3>
            <ul>
              <li>標準のオセロと同じ盤・反転ルール。</li>
              <li>
                各ターン、両者は <strong>秘密入札</strong> でその手の着手権を競る。
              </li>
              <li>
                高い金額を入札した方が勝ち、自分の入札額を支払って着手する
                (ファーストプライス)。
              </li>
              <li>支払ったチップは場 (バンク) へ消える。総量は減る一方。</li>
            </ul>
            <h3>同額のとき</h3>
            <ul>
              <li>
                先手権 <strong>トークン (★)</strong> 保持者が勝ち。
              </li>
              <li>勝者が次の着手をすると、後述のルールでトークンが移動する。</li>
            </ul>
            <h3>トークンの移動ルール</h3>
            <ul>
              <li>
                <strong>トークン保持者が手を指したら</strong>、トークンは相手プレイヤーへ
                <em>移動</em> する。
              </li>
              <li>
                <strong>非保持者が手を指したら</strong>、トークンは保持者のもとに
                <em>そのまま残る</em>。
              </li>
              <li>
                つまりトークンは「直近で手を指していないプレイヤー」が常に持つ。
                次のタイの先手権が常に「もう片方」へ自動で渡る。
              </li>
            </ul>
            <h3>戦略のコア</h3>
            <ul>
              <li>
                角を取れる手は <strong>順オークション</strong> (高く積んで欲しい権利)。
              </li>
              <li>
                逆に「相手に角隣接を打たせたい」局面では <strong>逆オークション</strong>{' '}
                (高く積んで相手に押し付ける)。
              </li>
              <li>
                トークンは <em>保険</em> でも <em>呪い</em> でもある。
              </li>
            </ul>
            <h3>終局</h3>
            <ul>
              <li>両者合法手がない、または両者チップが0になり保持者が最終1手を打つ。</li>
              <li>石数 → 残チップ → 引き分け、の順に勝敗判定。</li>
            </ul>
            <h3>オプション</h3>
            <ul>
              <li>
                ゼロ入札制限: 連続0入札が <code>N</code> 回続くと最小入札 1 を強制。
              </li>
            </ul>
            <h3>NPC 難易度</h3>
            <ul>
              <li>
                <strong>初級</strong>: 完全ランダム。練習用。
              </li>
              <li>
                <strong>中級</strong>: 浅い α-β 探索 + 中程度の入札。
              </li>
              <li>
                <strong>上級</strong>: 深さ 4 探索 + 戦略的入札。
              </li>
              <li>
                <strong style={{ color: 'var(--danger)' }}>鬼</strong>: 動的深度
                6〜10、終盤完全解析。本気を出してきます。
              </li>
            </ul>
            <h3>キーボード操作</h3>
            <ul>
              <li>
                盤面で <code>Tab</code> でセルへフォーカス、<code>↑↓←→</code> で移動、
                <code>Enter</code>/<code>Space</code> で着手。
              </li>
              <li>
                オーバーレイは <code>Esc</code> で閉じる。
              </li>
            </ul>
          </div>
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </FocusTrap>
    </div>
  );
}
