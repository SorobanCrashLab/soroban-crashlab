import { cloneElement, useId, type ReactElement } from 'react';

export interface TooltipProps {
  content: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const existingDescription = children.props['aria-describedby'];
  const describedBy = existingDescription ? `${existingDescription} ${id}` : id;

  return (
    <span className="ds-tooltip">
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span className="ds-tooltip-content" id={id} role="tooltip">{content}</span>
    </span>
  );
}
