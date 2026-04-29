import React from 'react';
import { FocusTrap } from './FocusTrap';

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal yes/no dialog. Esc cancels, Enter confirms (when focus is on the
 * confirm button, which is auto-focused on mount).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="overlay"
      role="alertdialog"
      aria-label={title}
      onClick={onCancel}
    >
      <FocusTrap onEscape={onCancel} autoFocusSelector=".confirm-primary">
        <div
          className="overlay-card"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 420 }}
        >
          <h2 style={{ marginTop: 0 }}>{title}</h2>
          <div style={{ marginBottom: '0.8rem' }}>{message}</div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button onClick={onCancel}>{cancelLabel}</button>
            <button
              className={`confirm-primary ${danger ? 'danger' : 'primary'}`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
