'use client';

import { memo, useCallback } from 'react';
import type { FilterGroup, FilterCondition, FilterNode } from '../ast/FilterAST';
import { isCondition, isGroup, createCondition } from '../ast/FilterAST';
import { ConditionRow } from './ConditionRow';

interface GroupRowProps {
  group: FilterGroup;
  depth: number;
  onChange: (updates: { groupType?: 'and' | 'or'; children?: FilterNode[] }) => void;
  onRemove: () => void;
  onAddCondition: () => void;
  onAddGroup: () => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onUpdateCondition: (conditionId: string, updates: Partial<FilterCondition>) => void;
  disabled?: boolean;
}

function GroupRowBase({
  group,
  depth,
  onChange,
  onRemove,
  onAddCondition,
  onAddGroup,
  onRemoveNode,
  onDuplicateNode,
  onUpdateCondition,
  disabled,
}: GroupRowProps) {
  const handleToggle = useCallback(() => {
    onChange({ groupType: group.groupType === 'and' ? 'or' : 'and' });
  }, [group.groupType, onChange]);

  const indentStyle = { marginLeft: `${depth * 20}px` };

  return (
    <div
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      style={indentStyle}
      role="group"
      aria-label={`${group.groupType.toUpperCase()} group`}
    >
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className="px-2 py-1 text-xs font-bold rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          aria-label={`Toggle group logic. Currently ${group.groupType.toUpperCase()}`}
        >
          {group.groupType.toUpperCase()}
        </button>
        {depth > 0 && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-50"
            aria-label="Remove group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Group children */}
      <div className="p-2 space-y-2">
        {group.children.map((child, i) => {
          if (isCondition(child)) {
            return (
              <ConditionRow
                key={child.id}
                condition={child}
                index={i}
                onChange={(updates) => onUpdateCondition(child.id, updates)}
                onRemove={() => onRemoveNode(child.id)}
                onDuplicate={() => onDuplicateNode(child.id)}
                disabled={disabled}
              />
            );
          }
          if (isGroup(child)) {
            return (
              <GroupRow
                key={child.id}
                group={child}
                depth={depth + 1}
                onChange={(updates) => {
                  const newChildren = group.children.map((c) =>
                    c.id === child.id ? { ...child, ...updates } : c,
                  );
                  onChange({ children: newChildren });
                }}
                onRemove={() => onRemoveNode(child.id)}
                onAddCondition={() => {
                  const newCondition = createCondition('status', 'eq', '');
                  const newChild: FilterGroup = { ...child, children: [...child.children, newCondition] };
                  const newChildren = group.children.map((c) =>
                    c.id === child.id ? newChild : c,
                  );
                  onChange({ children: newChildren });
                }}
                onAddGroup={() => {
                  const newChildGroup: FilterGroup = { id: '', type: 'group', groupType: 'and', children: [] };
                  const newChild: FilterGroup = { ...child, children: [...child.children, newChildGroup] };
                  const newChildren = group.children.map((c) =>
                    c.id === child.id ? newChild : c,
                  );
                  onChange({ children: newChildren });
                }}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onUpdateCondition={onUpdateCondition}
                disabled={disabled}
              />
            );
          }
          return null;
        })}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={onAddCondition}
          disabled={disabled}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 disabled:opacity-50"
        >
          + Add Condition
        </button>
        <button
          type="button"
          onClick={onAddGroup}
          disabled={disabled}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 disabled:opacity-50"
        >
          + Add Group
        </button>
      </div>
    </div>
  );
}

export const GroupRow = memo(GroupRowBase);
