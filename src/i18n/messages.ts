/**
 * Tiny i18n. Default language is 'ja'. Add new locales by creating a sibling
 * messages object with the same keys. Lookups fall back to JA if missing.
 */

export type Locale = 'ja' | 'en';

const ja = {
  appTitle: 'ビッド式オセロ',
  appSubtitle: '着手権を秘密入札で取り合う、戦略的オセロ。',
  rules: 'ルール',
  tour: 'ツアー',
  colorBlind: '色覚配慮',
  reducedMotion: '動き軽減',
  soundOn: '音 ON',
  soundOff: '音 OFF',
  language: '言語',
  // Lobby
  lobbyHotseat: '同機ホットシート',
  lobbyAi: 'NPC 対戦',
  lobbyOnline: '友達とオンライン',
  initialChips: '初期チップ',
  cornerBonus: '角ボーナス',
  zeroBidStreakLimit: '連続0入札制限',
  unlimited: '無制限',
  npcColor: 'NPC の色',
  black: '黒',
  white: '白',
  blackFirst: '黒(先手)',
  whiteSecond: '白(後手)',
  difficulty: '難易度',
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  oni: '鬼',
  startGame: '対局開始',
  startVsAi: 'NPC と対局',
  toRoomSelect: 'ルーム選択へ',
  // Game
  back: 'ロビー',
  retry: '新しい対局',
  resign: '投了',
  heatmap: 'ヒートマップ',
  hint: 'ヒント',
  toRestore: '復元済み',
  // Banner
  biddingPhase: '入札フェーズ',
  resolvingPhase: '入札解決中',
  placingPhase: 'の着手',
  freeMovePhase: '無償着手',
  finalMovePhase: '最終1手',
  endedPhase: '対局終了',
  bidConfirm: '入札を確定',
} as const;

type MessageKey = keyof typeof ja;

const en: Partial<Record<MessageKey, string>> = {
  appTitle: 'Bidding Othello',
  appSubtitle: 'Strategic Othello where every turn is auctioned by sealed bids.',
  rules: 'Rules',
  tour: 'Tour',
  colorBlind: 'High contrast',
  reducedMotion: 'Reduce motion',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  language: 'Lang',
  lobbyHotseat: 'Hotseat',
  lobbyAi: 'vs NPC',
  lobbyOnline: 'Online with a friend',
  initialChips: 'Initial chips',
  cornerBonus: 'Corner bonus',
  zeroBidStreakLimit: 'Zero-bid streak limit',
  unlimited: 'unlimited',
  npcColor: 'NPC colour',
  black: 'Black',
  white: 'White',
  blackFirst: 'Black (first)',
  whiteSecond: 'White (second)',
  difficulty: 'Difficulty',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  oni: 'Oni',
  startGame: 'Start game',
  startVsAi: 'Play NPC',
  toRoomSelect: 'Choose a room',
  back: 'Lobby',
  retry: 'New game',
  resign: 'Resign',
  heatmap: 'Heatmap',
  hint: 'Hint',
  toRestore: 'Restored',
  biddingPhase: 'Bidding phase',
  resolvingPhase: 'Resolving',
  placingPhase: ' to place',
  freeMovePhase: 'Free move',
  finalMovePhase: 'Final move',
  endedPhase: 'Game over',
  bidConfirm: 'Confirm bid',
};

export const MESSAGES: Record<Locale, Partial<Record<MessageKey, string>>> = {
  ja,
  en,
};

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale]?.[key] ?? ja[key];
}
