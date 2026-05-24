import React, { useEffect, useRef } from 'react';
import { Color } from '../core/types';
import { useI18n } from '../i18n';

/**
 * Hard-coded preset chat messages, deliberately small and curated.
 *
 * オーナー判断 (2026-05-24 #2): UGC を出さず App Store 4+ レーティングを維持し、
 * 不正・通報運用負荷を最小化するため、自由入力ではなくプリセット選択型に固定する。
 *
 * `id` はネットワーク越しに送る本文の英語キーではなく、ローカルのキー。実際に
 * 送る `text` は送信側のロケールに従う (受信側は自分のロケールで再解釈しない、
 * UGC ではなく定型文なので i18n よりも「相手が選んだそのもの」を表示するのが
 * 自然)。将来サーバ側で id 配信に切り替える余地は残す。
 */
const PRESETS: Array<{
  id: string;
  ja: string;
  en: string;
}> = [
  { id: 'gg', ja: 'グッドゲーム!', en: 'Good game!' },
  { id: 'thanks', ja: 'ありがとう', en: 'Thanks' },
  { id: 'nice', ja: 'ナイス手!', en: 'Nice move!' },
  { id: 'thinking', ja: '考え中…', en: 'Thinking…' },
  { id: 'rematch', ja: '次戦お願いします', en: 'Rematch?' },
  { id: 'resign', ja: '降参します', en: 'I resign' },
  { id: 'sorry', ja: 'ごめん', en: 'Sorry' },
  { id: 'seeyou', ja: 'またね', en: 'See you' },
];

interface Props {
  chatLog: Array<{ from: Color | 'SPECTATE'; text: string }>;
  onSendText: (text: string) => void;
}

/**
 * Preset-only chat panel. There is intentionally no free-text input;
 * players pick a curated phrase. This keeps the surface area for moderation
 * tiny and removes any "what if they paste a URL" considerations from
 * the App Store privacy review.
 */
export function ChatPanel({ chatLog, onSendText }: Props) {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [chatLog]);

  return (
    <div className="bid-panel">
      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>💬 チャット</div>
      <div className="chat-log" ref={ref}>
        {chatLog.length === 0 && (
          <span className="muted">
            {locale === 'ja'
              ? 'まだメッセージはありません'
              : 'No messages yet'}
          </span>
        )}
        {chatLog.map((c, i) => (
          <div key={i}>
            <span
              className={
                c.from === 'BLACK'
                  ? 'who-black'
                  : c.from === 'WHITE'
                    ? 'who-white'
                    : 'who-spec'
              }
            >
              {c.from === 'BLACK' ? '⚫' : c.from === 'WHITE' ? '⚪' : '👁'}
            </span>{' '}
            {c.text}
          </div>
        ))}
      </div>
      <div
        className="row"
        role="group"
        aria-label={locale === 'ja' ? '定型文を選択' : 'Choose a preset'}
        style={{ flexWrap: 'wrap', gap: '0.3rem' }}
      >
        {PRESETS.map(p => {
          const label = locale === 'en' ? p.en : p.ja;
          return (
            <button
              key={p.id}
              className="ghost"
              type="button"
              onClick={() => onSendText(label)}
              style={{ fontSize: '0.85rem' }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
