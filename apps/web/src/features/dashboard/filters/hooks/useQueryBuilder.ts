'use client';

import { useState, useCallback, useMemo } from 'react';
import type { FilterAST, FilterCondition, FilterGroup, FilterNode } from '../ast/FilterAST';
import { createCondition, createGroup, createEmptyAST, isGroup } from '../ast/FilterAST';
import { addCondition, addGroup, removeNode, updateCondition, updateGroupType, duplicateNode } from '../ast/builders';

export interface QueryBuilderActions {
  addCondition: () => void;
  addGroup: () => void;
  removeNode: (nodeId: string) => void;
  updateCondition: (conditionId: string, updates: Partial<FilterCondition>) => void;
  updateGroupType: (groupId: string, groupType: 'and' | 'or') => void;
  duplicateNode: (nodeId: string) => void;
  clear: () => void;
  setAST: (ast: FilterAST) => void;
}

export function useQueryBuilder(initialAST?: FilterAST) {
  const [ast, setAST] = useState<FilterAST>(initialAST ?? createEmptyAST());

  const actions = useMemo<QueryBuilderActions>(() => ({
    addCondition: () => setAST((prev) => addCondition(prev, { field: 'status', operator: 'eq', value: '' })),
    addGroup: () => setAST((prev) => addGroup(prev, 'and', [])),
    removeNode: (nodeId) => setAST((prev) => removeNode(prev, nodeId)),
    updateCondition: (conditionId, updates) =>
      setAST((prev) => updateCondition(prev, conditionId, updates)),
    updateGroupType: (groupId, groupType) =>
      setAST((prev) => updateGroupType(prev, groupId, groupType)),
    duplicateNode: (nodeId) => setAST((prev) => duplicateNode(prev, nodeId)),
    clear: () => setAST(createEmptyAST()),
    setAST,
  }), []);

  return { ast, actions };
}
