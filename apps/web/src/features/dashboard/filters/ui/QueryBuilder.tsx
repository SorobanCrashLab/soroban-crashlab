'use client';

import { memo, useCallback, useState } from 'react';
import type { FilterAST, FilterGroup, FilterCondition, FilterNode } from '../ast/FilterAST';
import { createCondition, createGroup, createEmptyAST, isGroup } from '../ast/FilterAST';
import { GroupRow } from './GroupRow';
import { buildShareableURL, isURLWithinLimit } from '../url/FilterURLCodec';

interface QueryBuilderProps {
  ast: FilterAST;
  onChange: (ast: FilterAST) => void;
  totalCount: number;
  matchCount: number;
  matchDuration?: number;
  onSave?: (name: string, description: string) => void;
  disabled?: boolean;
}

function QueryBuilderBase({
  ast,
  onChange,
  totalCount,
  matchCount,
  matchDuration,
  onSave,
  disabled,
}: QueryBuilderProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [urlWarning, setUrlWarning] = useState(false);

  const handleAddCondition = useCallback(() => {
    const condition = createCondition('status', 'eq', '');
    onChange({ ...ast, children: [...ast.children, condition] });
  }, [ast, onChange]);

  const handleAddGroup = useCallback(() => {
    const group = createGroup('and', []);
    onChange({ ...ast, children: [...ast.children, group] });
  }, [ast, onChange]);

  const handleClear = useCallback(() => {
    onChange(createEmptyAST());
  }, [onChange]);

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      function removeFromGroup(group: FilterGroup): FilterGroup {
        return {
          ...group,
          children: group.children
            .filter((child) => child.id !== nodeId)
            .map((child) => (isGroup(child) ? removeFromGroup(child) : child)),
        };
      }
      onChange(removeFromGroup(ast));
    },
    [ast, onChange],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      function clone(node: FilterNode): FilterNode {
        if (node.type === 'condition') {
          return { ...node, id: `n${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` };
        }
        return { ...node, id: `n${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, children: node.children.map(clone) };
      }
      function duplicateInGroup(group: FilterGroup): FilterGroup {
        const newChildren: FilterNode[] = [];
        for (const child of group.children) {
          newChildren.push(child);
          if (child.id === nodeId) {
            newChildren.push(clone(child));
          } else if (isGroup(child)) {
            const updated = duplicateInGroup(child);
            if (updated !== child) {
              newChildren[newChildren.length - 1] = updated;
            }
          }
        }
        return { ...group, children: newChildren };
      }
      onChange(duplicateInGroup(ast));
    },
    [ast, onChange],
  );

  const handleUpdateCondition = useCallback(
    (conditionId: string, updates: Partial<FilterCondition>) => {
      function updateInGroup(group: FilterGroup): FilterGroup {
        return {
          ...group,
          children: group.children.map((child) => {
            if (child.type === 'condition' && child.id === conditionId) {
              return { ...child, ...updates };
            }
            if (isGroup(child)) {
              return updateInGroup(child);
            }
            return child;
          }),
        };
      }
      onChange(updateInGroup(ast));
    },
    [ast, onChange],
  );

  const handleShareURL = useCallback(() => {
    if (typeof window === 'undefined') return;
    const baseUrl = window.location.origin + window.location.pathname;
    const url = buildShareableURL(baseUrl, ast);
    setShareUrl(url);
    setUrlWarning(!isURLWithinLimit(url));
  }, [ast]);

  const handleSave = useCallback(() => {
    if (onSave && saveName.trim()) {
      onSave(saveName.trim(), saveDescription.trim());
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
    }
  }, [onSave, saveName, saveDescription]);

  const percent = totalCount > 0 ? (matchCount / totalCount) * 100 : 0;

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Query Builder</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSaveDialog(!showSaveDialog)}
            disabled={disabled}
            className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Save View
          </button>
        </div>
      </div>

      <GroupRow
        group={ast}
        depth={0}
        onChange={(updates) => onChange({ ...ast, ...updates })}
        onRemove={() => {}}
        onAddCondition={handleAddCondition}
        onAddGroup={handleAddGroup}
        onRemoveNode={handleRemoveNode}
        onDuplicateNode={handleDuplicateNode}
        onUpdateCondition={handleUpdateCondition}
        disabled={disabled}
      />

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={handleAddCondition}
          disabled={disabled}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-3 py-1.5 disabled:opacity-50"
        >
          + Add Condition
        </button>
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={disabled}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-3 py-1.5 disabled:opacity-50"
        >
          + Add Group
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-1.5 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleShareURL}
          disabled={disabled}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-3 py-1.5 disabled:opacity-50"
        >
          Share URL
        </button>
      </div>

      {/* Results summary */}
      <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          Results: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{matchCount.toLocaleString()}</span>
          {' / '}
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{totalCount.toLocaleString()}</span>
          {' runs '}
          <span className="text-zinc-400">({percent.toFixed(1)}%)</span>
          {matchDuration !== undefined && (
            <span className="text-zinc-400 ml-1">{' \u26A1 '}{matchDuration}ms</span>
          )}
        </p>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="mt-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="View name..."
            className="w-full px-3 py-2 mb-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm"
          />
          <input
            type="text"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Description (optional)..."
            className="w-full px-3 py-2 mb-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowSaveDialog(false)}
              className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Share URL display */}
      {shareUrl && (
        <div className="mt-4 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
          {urlWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              URL exceeds 2000 characters and may be truncated by some clients.
            </p>
          )}
          <input
            type="text"
            value={shareUrl}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm font-mono"
            aria-label="Shareable URL"
          />
        </div>
      )}
    </div>
  );
}

export const QueryBuilder = memo(QueryBuilderBase);
