'use client';

import { useCallback, useState } from 'react';
import {
  createCondition,
  createGroup,
  addCondition,
  removeCondition,
  updateCondition,
  addGroup,
  removeGroup,
  generateQueryString,
  AVAILABLE_FIELDS,
  OPERATORS,
  type FilterGroup,
  type FilterCondition,
  type FilterOperator,
} from './query-builder-utils';

export default function QueryBuilderPage() {
  const [queryGroup, setQueryGroup] = useState<FilterGroup>(createGroup('root'));
  const [queryOutput, setQueryOutput] = useState('');

  const updateGroupRecursive = useCallback(
    function recurse(group: FilterGroup, targetId: string, update: (g: FilterGroup) => FilterGroup): FilterGroup {
      if (group.id === targetId) return update(group);
      return {
        ...group,
        groups: group.groups.map(g => recurse(g, targetId, update)),
      };
    },
    [],
  );

  const handleAddCondition = useCallback((groupId: string) => {
    const id = `cond-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const condition = createCondition(id, 'status');
    setQueryGroup(prev => {
      const next = updateGroupRecursive(prev, groupId, g => addCondition(g, condition));
      setQueryOutput(generateQueryString(next));
      return next;
    });
  }, [updateGroupRecursive]);

  const handleRemoveCondition = useCallback((groupId: string, conditionId: string) => {
    setQueryGroup(prev => {
      const next = updateGroupRecursive(prev, groupId, g => removeCondition(g, conditionId));
      setQueryOutput(generateQueryString(next));
      return next;
    });
  }, [updateGroupRecursive]);

  const handleUpdateCondition = useCallback((groupId: string, updatedCondition: FilterCondition) => {
    setQueryGroup(prev => {
      const next = updateGroupRecursive(prev, groupId, g => updateCondition(g, updatedCondition));
      setQueryOutput(generateQueryString(next));
      return next;
    });
  }, [updateGroupRecursive]);

  const handleAddGroup = useCallback((parentGroupId: string) => {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newGroup = createGroup(id);
    setQueryGroup(prev => {
      const next = updateGroupRecursive(prev, parentGroupId, g => addGroup(g, newGroup));
      setQueryOutput(generateQueryString(next));
      return next;
    });
  }, [updateGroupRecursive]);

  const handleRemoveGroup = useCallback((parentGroupId: string, groupId: string) => {
    setQueryGroup(prev => {
      const next = updateGroupRecursive(prev, parentGroupId, g => removeGroup(g, groupId));
      setQueryOutput(generateQueryString(next));
      return next;
    });
  }, [updateGroupRecursive]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Query Builder</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">Build complex filters with AND/OR logic groups</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <QueryGroupBuilder
                group={queryGroup}
                onAddCondition={handleAddCondition}
                onRemoveCondition={handleRemoveCondition}
                onUpdateCondition={handleUpdateCondition}
                onAddGroup={handleAddGroup}
                onRemoveGroup={handleRemoveGroup}
              />
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 sticky top-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Query Output</h3>
              <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded font-mono text-sm text-zinc-700 dark:text-zinc-300 break-words">
                {queryOutput || '(empty)'}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(queryOutput);
                }}
                className="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Copy Query
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QueryGroupBuilderProps {
  group: FilterGroup;
  onAddCondition: (groupId: string) => void;
  onRemoveCondition: (groupId: string, conditionId: string) => void;
  onUpdateCondition: (groupId: string, condition: FilterCondition) => void;
  onAddGroup: (parentGroupId: string) => void;
  onRemoveGroup: (parentGroupId: string, groupId: string) => void;
}

function QueryGroupBuilder({
  group,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onAddGroup,
  onRemoveGroup,
}: QueryGroupBuilderProps) {
  const depth = group.id === 'root' ? 0 : 1;

  return (
    <div className={`space-y-4 ${depth > 0 ? 'ml-4 pl-4 border-l-2 border-blue-200 dark:border-blue-900' : ''}`}>
      {group.id !== 'root' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">Logic</span>
        </div>
      )}

      {group.conditions.map(condition => (
        <div key={condition.id} className="flex items-end gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded">
          <select
            value={condition.field}
            onChange={e =>
              onUpdateCondition(group.id, { ...condition, field: e.target.value, operator: 'equals', value: '' })
            }
            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
          >
            {AVAILABLE_FIELDS.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <select
            value={condition.operator}
            onChange={e =>
              onUpdateCondition(group.id, { ...condition, operator: e.target.value as FilterOperator })
            }
            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
          >
            {OPERATORS.select.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>

          <input
            type="text"
            value={condition.value}
            onChange={e =>
              onUpdateCondition(group.id, { ...condition, value: e.target.value })
            }
            placeholder="Value"
            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm flex-1"
          />

          <button
            onClick={() => onRemoveCondition(group.id, condition.id)}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <button
          onClick={() => onAddCondition(group.id)}
          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
        >
          + Condition
        </button>
        <button
          onClick={() => onAddGroup(group.id)}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors"
        >
          + Group
        </button>
      </div>

      {group.groups.map(subgroup => (
        <div key={subgroup.id} className="relative">
          <button
            onClick={() => onRemoveGroup(group.id, subgroup.id)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold transition-colors"
          >
            ✕
          </button>
          <QueryGroupBuilder
            group={subgroup}
            onAddCondition={onAddCondition}
            onRemoveCondition={onRemoveCondition}
            onUpdateCondition={onUpdateCondition}
            onAddGroup={onAddGroup}
            onRemoveGroup={onRemoveGroup}
          />
        </div>
      ))}
    </div>
  );
}
