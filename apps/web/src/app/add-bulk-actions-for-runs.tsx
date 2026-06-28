'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { FuzzingRun } from './types';
import {
  canPerformBulkAction,
  getBulkActionDescription,
  type BulkActionType,
} from './runs-bulk-actions-utils';

export type BulkAction = BulkActionType;

interface BulkActionsProps {
  selectedRuns: FuzzingRun[];
  onAction: (action: BulkAction, runIds: string[], data?: Record<string, unknown>) => void;
  onClearSelection: () => void;
  disabled?: boolean;
}

const BULK_ACTIONS: BulkActionType[] = [
  'cancel',
  'retry',
  'delete',
  'export',
  'tag',
  'assign',
];

const BulkActionsForRuns: React.FC<BulkActionsProps> = ({
  selectedRuns,
  onAction,
  onClearSelection,
  disabled = false,
}) => {
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<BulkActionType | null>(null);
  const [actionData, setActionData] = useState<Record<string, string | boolean>>({});

  const handleActionSelect = useCallback(
    (action: BulkActionType) => {
      setSelectedAction(action);
      setIsActionMenuOpen(false);

      if (action === 'export' || action === 'tag' || action === 'assign') {
        return;
      }

      const runIds = selectedRuns.map((run) => run.id);
      onAction(action, runIds);
      setSelectedAction(null);
    },
    [selectedRuns, onAction],
  );

  const handleActionConfirm = useCallback(() => {
    if (!selectedAction) return;

    const runIds = selectedRuns.map((run) => run.id);
    onAction(selectedAction, runIds, actionData);
    setSelectedAction(null);
    setActionData({});
  }, [selectedAction, selectedRuns, actionData, onAction]);

  const handleActionCancel = useCallback(() => {
    setSelectedAction(null);
    setActionData({});
  }, []);

  const renderActionModal = () => {
    if (!selectedAction) return null;

    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="card card-padding max-w-md w-full mx-4">
          <h3 className="heading-section mb-4">
            {selectedAction === 'export' && 'Export Runs'}
            {selectedAction === 'tag' && 'Add Tags'}
            {selectedAction === 'assign' && 'Assign Runs'}
          </h3>

          {selectedAction === 'export' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Export Format
                </label>
                <select
                  value={String(actionData.format || 'json')}
                  onChange={(e) => setActionData({ ...actionData, format: e.target.value })}
                  className="input-field"
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                </select>
              </div>
              <div>
                <label className="flex items-center text-sm" style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(actionData.includeCrashDetails)}
                    onChange={(e) =>
                      setActionData({ ...actionData, includeCrashDetails: e.target.checked })
                    }
                    className="rounded border-gray-300 mr-2"
                  />
                  Include crash details
                </label>
              </div>
            </div>
          )}

          {selectedAction === 'tag' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={String(actionData.tags || '')}
                  onChange={(e) => setActionData({ ...actionData, tags: e.target.value })}
                  placeholder="e.g., high-priority, needs-review"
                  className="input-field"
                />
              </div>
            </div>
          )}

          {selectedAction === 'assign' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Assign To
                </label>
                <select
                  value={String(actionData.assignee || '')}
                  onChange={(e) => setActionData({ ...actionData, assignee: e.target.value })}
                  className="input-field"
                >
                  <option value="">Select assignee...</option>
                  <option value="alice@example.com">Alice</option>
                  <option value="bob@example.com">Bob</option>
                  <option value="charlie@example.com">Charlie</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={handleActionCancel} className="btn-outline text-sm">
              Cancel
            </button>
            <button type="button" onClick={handleActionConfirm} className="btn-primary text-sm">
              Confirm {selectedAction}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (selectedRuns.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="card card-padding mb-4 sm:mb-6"
        style={{ borderLeft: '4px solid #0A66C2' }}
        data-testid="bulk-action-toolbar"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {selectedRuns.length} run{selectedRuns.length !== 1 ? 's' : ''} selected
            </span>
            <button type="button" onClick={onClearSelection} className="btn-ghost text-sm h-8 px-3">
              Clear selection
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
              disabled={disabled}
              className="btn-primary text-sm"
              aria-expanded={isActionMenuOpen}
              aria-haspopup="menu"
            >
              Bulk Actions
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isActionMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-56 card card-padding py-1 z-10"
                role="menu"
                style={{ padding: '4px 0' }}
              >
                {BULK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    onClick={() => handleActionSelect(action)}
                    disabled={!canPerformBulkAction(action, selectedRuns)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="font-medium capitalize">{action}</span>
                    <span className="text-xs text-meta">{getBulkActionDescription(action)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-meta text-xs sm:text-sm mt-3">
          Selected: {selectedRuns.slice(0, 5).map((run) => run.id).join(', ')}
          {selectedRuns.length > 5 && ` and ${selectedRuns.length - 5} more...`}
        </p>
      </div>

      {renderActionModal()}
    </>
  );
};

export default BulkActionsForRuns;
