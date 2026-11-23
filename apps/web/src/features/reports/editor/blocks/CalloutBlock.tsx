'use client';

import { memo } from 'react';
import { reportPlainText } from '../lib/sanitize';
import type { CalloutBlockData, CalloutVariant } from '../lib/types';

interface CalloutBlockProps {
  data: CalloutBlockData;
}

const STYLES: Record<CalloutVariant, { border: string; background: string; label: string }> = {
  info: { border: '#1570ef', background: 'rgba(21, 112, 239, 0.08)', label: 'Information' },
  warning: { border: '#dc6803', background: 'rgba(220, 104, 3, 0.08)', label: 'Warning' },
  success: { border: '#079455', background: 'rgba(7, 148, 85, 0.08)', label: 'Success' },
  danger: { border: '#b42318', background: 'rgba(180, 35, 24, 0.08)', label: 'Danger' },
};

export const CalloutBlock = memo(function CalloutBlock({ data }: CalloutBlockProps) {
  const style = STYLES[data.variant] ?? STYLES.info;
  return (
    <aside
      role={data.variant === 'danger' || data.variant === 'warning' ? 'alert' : 'note'}
      aria-label={`${style.label}: ${reportPlainText(data.title)}`}
      className="my-4 rounded-xl border-l-4 p-4"
      style={{ borderColor: style.border, background: style.background }}
    >
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {style.label}: {reportPlainText(data.title)}
      </h4>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {reportPlainText(data.body)}
      </p>
    </aside>
  );
});
