export type FilterOperator = 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between' | 'in';
export type FilterLogic = 'AND' | 'OR';

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string | number | string[];
}

export interface FilterGroup {
  id: string;
  logic: FilterLogic;
  conditions: FilterCondition[];
  groups: FilterGroup[];
}

export const AVAILABLE_FIELDS = [
  { id: 'status', name: 'Status', type: 'select' },
  { id: 'severity', name: 'Severity', type: 'select' },
  { id: 'area', name: 'Area', type: 'select' },
  { id: 'runNumber', name: 'Run Number', type: 'number' },
  { id: 'duration', name: 'Duration (ms)', type: 'number' },
  { id: 'resourceFee', name: 'Resource Fee', type: 'number' },
];

export const OPERATORS: Record<string, FilterOperator[]> = {
  select: ['equals', 'in'],
  number: ['equals', 'greaterThan', 'lessThan', 'between'],
  text: ['contains', 'equals'],
};

export const createCondition = (id: string, field: string): FilterCondition => ({
  id,
  field,
  operator: 'equals',
  value: '',
});

export const createGroup = (id: string, logic: FilterLogic = 'AND'): FilterGroup => ({
  id,
  logic,
  conditions: [],
  groups: [],
});

export const addCondition = (group: FilterGroup, condition: FilterCondition): FilterGroup => ({
  ...group,
  conditions: [...group.conditions, condition],
});

export const removeCondition = (group: FilterGroup, conditionId: string): FilterGroup => ({
  ...group,
  conditions: group.conditions.filter(c => c.id !== conditionId),
});

export const updateCondition = (group: FilterGroup, updatedCondition: FilterCondition): FilterGroup => ({
  ...group,
  conditions: group.conditions.map(c => c.id === updatedCondition.id ? updatedCondition : c),
});

export const addGroup = (parent: FilterGroup, subgroup: FilterGroup): FilterGroup => ({
  ...parent,
  groups: [...parent.groups, subgroup],
});

export const removeGroup = (parent: FilterGroup, groupId: string): FilterGroup => ({
  ...parent,
  groups: parent.groups.filter(g => g.id !== groupId).map(g => removeGroup(g, groupId)),
});

export const generateQueryString = (group: FilterGroup): string => {
  const conditionStrings = group.conditions.map(c => `${c.field}:${c.operator}:${c.value}`);
  const groupStrings = group.groups.map(g => `(${generateQueryString(g)})`);
  return [...conditionStrings, ...groupStrings].join(` ${group.logic} `);
};
