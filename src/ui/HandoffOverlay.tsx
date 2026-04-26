import React from 'react';

interface Props {
  title: string;
  description?: string;
  buttonLabel?: string;
  onClick: () => void;
}

export function HandoffOverlay({ title, description, buttonLabel, onClick }: Props) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>{title}</h2>
        {description && <div>{description}</div>}
        <button className="primary" onClick={onClick}>
          {buttonLabel ?? 'OK'}
        </button>
      </div>
    </div>
  );
}
