'use client';

import { useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  className?: string;
}

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  triggerRef,
  closeOnBackdrop = true,
  closeLabel = 'Close',
  className = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  useFocusTrap({
    containerRef: dialogRef,
    triggerRef,
    active: open,
    onClose,
    role: 'dialog',
  });

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  };

  if (!open) return null;

  return (
    <div className="ds-dialog-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        ref={dialogRef}
        className={`ds-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="ds-dialog-header">
          <div className="ds-dialog-heading">
            <h2 id={titleId} className="ds-dialog-title">{title}</h2>
            {description && <p id={descriptionId} className="ds-dialog-description">{description}</p>}
          </div>
          <button type="button" className="ds-dialog-close" onClick={onClose}>
            {closeLabel}
          </button>
        </header>
        <div className="ds-dialog-content">{children}</div>
      </div>
    </div>
  );
}
