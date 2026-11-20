'use client';

import { memo, useCallback } from 'react';
import type { FilterCondition, FilterField } from '../ast/FilterAST';
import { FIELD_MAP } from '../ast/FilterAST';
import { FieldAutocomplete } from './FieldAutocomplete';
import { OperatorSelect } from './OperatorSelect';
import { ValueAutocomplete } from './ValueAutocomplete';

interface ConditionRowProps {
  condition: FilterCondition;
  onChange: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  disabled?: boolean;
  index: number;
}

function ConditionRowBase({
  condition,
  onChange,
  onRemove,
  onDuplicate,
  disabled,
  index,
}: ConditionRowProps) {
  const field: FilterField | undefined = FIELD_MAP[condition.field];

  const handleFieldChange = useCallback(
    (fieldName: string) => {
      const newField = FIELD_MAP[fieldName];
      const newOperator = newField?.operators[0] ?? condition.operator;
      const newValue = newField?.type === 'boolean' ? false : '';
      onChange({ field: fieldName, operator: newOperator, value: newValue });
    },
    [condition.operator, onChange],
  );

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800"
      role="group"
      aria-label={`Condition ${index + 1}`}
    >
      <FieldAutocomplete
        value={condition.field}
        onChange={handleFieldChange}
        disabled={disabled}
      />
      <OperatorSelect
        value={condition.operator}
        operators={field?.operators ?? ['eq']}
        onChange={(op) => onChange({ operator: op })}
        disabled={disabled}
      />
      <ValueAutocomplete
        value={condition.value}
        onChange={(v) => onChange({ value: v })}
        suggestions={field?.enumValues}
        disabled={disabled}
      />
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={onDuplicate}
          disabled={disabled}
          className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors disabled:opacity-50"
          aria-label="Duplicate condition"
          title="Duplicate"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-50"
          aria-label={`Remove condition ${index + 1}`}
          title="Remove"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const ConditionRow = memo(ConditionRowBase);
