import React, { useMemo } from 'react';
import { GameState, TurnRecord } from '../core/types';

interface Props {
  state: GameState;
  /** Minimum bid difference (% of pot) flagged as a "blunder". */
  blunderPct?: number;
}

interface Insight {
  kind: 'corner' | 'overpay' | 'reverse' | 'tieLost';
  turn: TurnRecord;
  detail: string;
}

/**
 * Post-game review: scans the history for noteworthy events (lost
 * corners, overpays, reverse-auction wins, tie-broken loses) and lists
 * them. Designed to be shown next to the ResultCard at game end.
 */
export function ReviewPanel({ state, blunderPct = 0.6 }: Props) {
  const insights = useMemo(() => buildInsights(state, blunderPct), [state, blunderPct]);
  if (insights.length === 0) {
    return (
      <div className="review-panel">
        <h3>📝 振り返り</h3>
        <div className="muted">特筆すべきポイントはありません。クリーンな対局でした。</div>
      </div>
    );
  }
  return (
    <div className="review-panel">
      <h3>📝 振り返り</h3>
      <ul>
        {insights.map((it, i) => (
          <li key={i} className={`review-${it.kind}`}>
            <span className="review-turn">#{it.turn.turnNo}</span>
            <span>{it.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildInsights(state: GameState, blunderPct: number): Insight[] {
  const out: Insight[] = [];
  for (const t of state.history) {
    if (t.cornerBonusTo) {
      out.push({
        kind: 'corner',
        turn: t,
        detail: `${t.cornerBonusTo === 'BLACK' ? '黒' : '白'} が角を獲得 (+${t.cornerBonusCount ?? 1})`,
      });
    }
    if (t.bids && t.payment != null && t.winner) {
      const loserBid = t.bids[t.winner === 'BLACK' ? 'WHITE' : 'BLACK'];
      const winnerBid = t.bids[t.winner];
      const overpaid = winnerBid > 0 && winnerBid - loserBid >= winnerBid * blunderPct;
      if (overpaid && winnerBid >= 30) {
        out.push({
          kind: 'overpay',
          turn: t,
          detail: `${t.winner === 'BLACK' ? '黒' : '白'} がオーバーペイ (${winnerBid} vs ${loserBid})`,
        });
      }
      if (
        (t.bids.BLACK === 0 && t.bids.WHITE > 0) ||
        (t.bids.WHITE === 0 && t.bids.BLACK > 0)
      ) {
        out.push({
          kind: 'reverse',
          turn: t,
          detail: `${t.winner === 'BLACK' ? '黒' : '白'} が0入札の相手から落札 (リバース)`,
        });
      }
      if (t.tieBroken) {
        out.push({
          kind: 'tieLost',
          turn: t,
          detail: `同額入札 → トークン保持側が落札`,
        });
      }
    }
  }
  return out.slice(0, 12);
}
