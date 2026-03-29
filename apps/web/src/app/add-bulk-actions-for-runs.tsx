'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { FuzzingRun } from './types';

export type BulkAction = 'cancel' | 'retry' | 'delete' | 'export' | 'tag' | 'assign';

interface BulkActionsProps {
  selectedRuns: FuzzingRun[];
  onAction: (action: BulkAction, runIds: string[], data?: Record<string, unknown>) => void;
  onClearSelection: () => void;
  disabled?: boolean;
}

const BulkActionsForRuns: React.FC<BulkActionsProps> = ({
  selectedRuns,
  onAction,
  onClearSelection,
  disabled = false,
}) => {
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<BulkAction | null>(null);
  const [actionData, setActionData] = useState<Record<string, string | boolean>>({});

  const handleActionSelect = useCallback((action: BulkAction) => {
    setSelectedAction(action);
    setIsActionMenuOpen(false);
    
    if (action === 'export' || action === 'tag' || action === 'assign') {
      return;
    }
    
    const runIds = selectedRuns.map(run => run.id);
    onAction(action, runIds);
    setSelectedAction(null);
  }, [selectedRuns, onAction]);

  const handleActionConfirm = useCallback(() => {
    if (!selectedAction) return;
    
    const runIds = selectedRuns.map(run => run.id);
    onAction(selectedAction, runIds, actionData);
    setSelectedAction(null);
    setActionData({});
  }, [selectedAction, selectedRuns, actionData, onAction]);

  const handleActionCancel = useCallback(() => {
    setSelectedAction(null);
    setActionData({});
  }, []);

  const canPerformAction = useCallback((action: BulkAction): boolean => {
    switch (action) {
      case 'cancel':
        return selectedRuns.some(run => run.status === 'running');
      case 'retry':
        return selectedRuns.some(run => ['failed', 'cancelled'].includes(run.status));
      case 'delete':
        return selectedRuns.some(run => ['completed', 'failed', 'cancelled'].includes(run.status));
      case 'export':
      case 'tag':
      case 'assign':
        return selectedRuns.length > 0;
      default:
        return false;
    }
  }, [selectedRuns]);

  const getActionDescription = useCallback((action: BulkAction): string => {
    switch (action) {
      case 'cancel':
        return 'Cancel running runs';
      case 'retry':
        return 'Retry failed or cancelled runs';
      case 'delete':
        return 'Delete completed runs';
      case 'export':
        return 'Export selected runs data';
      case 'tag':
        return 'Add tags to selected runs';
      case 'assign':
        return 'Assign runs to team members';
      default:
        return '';
    }
  }, []);

  const renderActionModal = () => {
    if (!selectedAction) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">
            {selectedAction === 'export' && 'Export Runs'}
            {selectedAction === 'tag' && 'Add Tags'}
            {selectedAction === 'assign' && 'Assign Runs'}
          </h3>

          {selectedAction === 'export' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Export Format
                </label>
                <select
                  value={String(actionData.format || 'json')}
                  onChange={(e) => setActionData({ ...actionData, format: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                </select>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={Boolean(actionData.includeCrashDetails)}
                    onChange={(e) => setActionData({ ...actionData, includeCrashDetails: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Include crash details</span>
                </label>
              </div>
            </div>
          )}

          {selectedAction === 'tag' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={String(actionData.tags || '')}
                  onChange={(e) => setActionData({ ...actionData, tags: e.target.value })}
                  placeholder="e.g., high-priority, needs-review"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {selectedAction === 'assign' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To
                </label>
                <select
                  value={String(actionData.assignee || '')}
                  onChange={(e) => setActionData({ ...actionData, assignee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <button
              onClick={handleActionCancel}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleActionConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-900">
              {selectedRuns.length} run{selectedRuns.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClearSelection}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                disabled={disabled}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Bulk Actions
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                  <div className="py-1">
                    {(['cancel', 'retry', 'delete', 'export', 'tag', 'assign'] as BulkAction[]).map(action => (
                      <button
                        key={action}
                        onClick={() => handleActionSelect(action)}
                        disabled={!canPerformAction(action)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col"
                      >
                        <span className="font-medium capitalize">{action}</span>
                        <span className="text-xs text-gray-500">{getActionDescription(action)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedRuns.length > 0 && (
          <div className="mt-3 text-sm text-blue-800">
            Selected runs: {selectedRuns.slice(0, 5).map(run => run.id).join(', ')}
            {selectedRuns.length > 5 && ` and ${selectedRuns.length - 5} more...`}
          </div>
        )}
      </div>

      {renderActionModal()}
    </>
  );
};

export default BulkActionsForRuns;
