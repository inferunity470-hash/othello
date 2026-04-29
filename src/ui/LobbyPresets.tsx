import React from 'react';
import { GameOptions, DEFAULT_OPTIONS } from '../core/types';

export interface LobbyPreset {
  key: string;
  emoji: string;
  label: string;
  description: string;
  options: GameOptions;
}

export const LOBBY_PRESETS: LobbyPreset[] = [
  {
    key: 'quick',
    emoji: '⚡',
    label: 'クイック',
    description: '50 chips, 短時間で終局',
    options: {
      ...DEFAULT_OPTIONS,
      initialChips: 50,
      cornerBonus: 5,
      zeroBidStreakLimit: 3,
      auctionType: 'first-price',
    },
  },
  {
    key: 'classic',
    emoji: '🎯',
    label: 'クラシック',
    description: '200 chips, 推奨デフォルト',
    options: { ...DEFAULT_OPTIONS },
  },
  {
    key: 'long',
    emoji: '🐢',
    label: 'ロング',
    description: '500 chips, じっくり長考',
    options: {
      ...DEFAULT_OPTIONS,
      initialChips: 500,
      cornerBonus: 20,
    },
  },
  {
    key: 'oni',
    emoji: '😈',
    label: '鬼仕様',
    description: '200 chips + ストリーク 3 + 角 +15',
    options: {
      ...DEFAULT_OPTIONS,
      initialChips: 200,
      cornerBonus: 15,
      zeroBidStreakLimit: 3,
    },
  },
  {
    key: 'vickrey',
    emoji: '🪙',
    label: 'セカンド',
    description: 'Vickrey 競売 (落札者が相手の額を支払う)',
    options: {
      ...DEFAULT_OPTIONS,
      auctionType: 'second-price',
    },
  },
];

interface Props {
  selected?: string;
  onSelect: (preset: LobbyPreset) => void;
}

export function LobbyPresets({ selected, onSelect }: Props) {
  return (
    <div className="presets">
      {LOBBY_PRESETS.map(p => (
        <button
          key={p.key}
          className={`preset-btn ${selected === p.key ? 'active' : ''}`}
          onClick={() => onSelect(p)}
          title={p.description}
          aria-label={`${p.label} プリセット: ${p.description}`}
        >
          <span className="preset-emoji">{p.emoji}</span>
          <span className="preset-label">{p.label}</span>
          <span className="preset-desc">{p.description}</span>
        </button>
      ))}
    </div>
  );
}
