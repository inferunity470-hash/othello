import React from 'react';

interface Props {
  emoji?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Friendly empty-state placeholder. Use in panels that have no data
 * yet (no log entries, no stats, no replay history).
 */
export function EmptyState({ emoji = '📭', title, description, action }: Props) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-emoji" aria-hidden="true">
        {emoji}
      </div>
      <div className="empty-state-title">{title}</div>
      {description && (
        <div className="empty-state-desc muted">{description}</div>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
