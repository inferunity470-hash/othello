import React, { useMemo, useState } from 'react';
import { aggregate, clearRecords, GameRecord, loadRecords } from './stats';
import { FocusTrap } from './FocusTrap';

interface Props {
  onClose: () => void;
}

/**
 * Modal dashboard showing aggregated career stats: win rate, average bid,
 * corner rate, longest streak, last 10 games. Backed by localStorage via
 * `stats.ts`. Includes a clear-history button.
 */
export function StatsDashboard({ onClose }: Props) {
  const [records, setRecords] = useState<GameRecord[]>(() => loadRecords());
  const stats = useMemo(() => aggregate(records), [records]);
  const recent = useMemo(() => records.slice(-10).reverse(), [records]);

  const winRate =
    stats.myWins + stats.myLosses > 0
      ? Math.round((stats.myWins / (stats.myWins + stats.myLosses)) * 100)
      : 0;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-label="戦績ダッシュボード"
      onClick={onClose}
    >
      <FocusTrap onEscape={onClose} autoFocusSelector="button">
        <div
          className="overlay-card"
          style={{ maxWidth: 640 }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ marginTop: 0 }}>📊 戦績ダッシュボード</h2>
          {records.length === 0 ? (
            <div className="muted" style={{ padding: '0.6rem 0' }}>
              まだ対局記録がありません。NPC かオンラインで一局指してみましょう。
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <Stat label="総対局" value={`${stats.total}`} />
                <Stat
                  label="勝率"
                  value={`${winRate}%`}
                  hint={`${stats.myWins}勝 / ${stats.myLosses}敗 / ${stats.draws}分`}
                />
                <Stat
                  label="連勝/連敗"
                  value={
                    stats.longestStreak.kind === 'none'
                      ? '—'
                      : `${stats.longestStreak.n} ${
                          stats.longestStreak.kind === 'win' ? '連勝' : '連敗'
                        }`
                  }
                />
                <Stat
                  label="平均入札 (黒/白)"
                  value={`${stats.myAvgBidBlack} / ${stats.myAvgBidWhite}`}
                />
                <Stat
                  label="角獲得 / 局"
                  value={stats.myCornerRate.toFixed(2)}
                />
                <Stat
                  label="リバース / 局"
                  value={stats.myReverseAuctionRate.toFixed(2)}
                  hint="0入札保持で相手に着手させた回数"
                />
                <Stat label="平均手数" value={`${stats.avgTurns}`} />
                <Stat label="平均時間" value={`${stats.avgDurationSec}秒`} />
              </div>
              <h3 style={{ marginBottom: '0.4rem' }}>直近 10 局</h3>
              <ul className="recent-games">
                {recent.map((r, i) => (
                  <li key={`${r.endedAt}-${i}`}>
                    <span className="muted" style={{ minWidth: '5.2rem' }}>
                      {fmtDate(r.endedAt)}
                    </span>
                    <span style={{ flex: 1 }}>
                      {r.myColor && r.myColor !== 'SPECTATE' ? (
                        r.result.winner === 'DRAW' ? (
                          <span className="pill">引分</span>
                        ) : r.result.winner === r.myColor ? (
                          <span className="pill good">勝</span>
                        ) : (
                          <span className="pill warn">負</span>
                        )
                      ) : (
                        <span className="pill">観戦</span>
                      )}{' '}
                      ⚫ {r.result.stones.BLACK} - {r.result.stones.WHITE} ⚪
                    </span>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {Math.round(r.durationMs / 1000)}秒・{r.turns}手
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button
              className="ghost"
              onClick={() => {
                if (window.confirm('全ての戦績を削除しますか?')) {
                  clearRecords();
                  setRecords([]);
                }
              }}
              disabled={records.length === 0}
            >
              🗑 全削除
            </button>
            <button onClick={onClose}>閉じる (Esc)</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint muted">{hint}</div>}
    </div>
  );
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}
