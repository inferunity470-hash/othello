import React from 'react';
import { FocusTrap } from './FocusTrap';

interface Props {
  title: string;
  description?: string;
  buttonLabel?: string;
  onClick: () => void;
}

export function HandoffOverlay({
  title,
  description,
  buttonLabel,
  onClick,
}: Props) {
  return (
    <div className="overlay" role="dialog" aria-label={title}>
      <FocusTrap onEscape={onClick} autoFocusSelector=".primary">
        <div className="overlay-card">
          <h2>{title}</h2>
          {description && <div>{description}</div>}
          <button className="primary" onClick={onClick}>
            {buttonLabel ?? 'OK'}
          </button>
        </div>
      </FocusTrap>
    </div>
  );
}
