'use client';

import { memo, useCallback } from 'react';
import type { FilterOperator } from '../ast/FilterAST';
import { OPERATOR_LABELS } from '../ast/FilterAST';

interface OperatorSelectProps {
  value: FilterOperator;
  operators: FilterOperator[];
  onChange: (operator: FilterOperator) => void;
  disabled?: boolean;
}

function OperatorSelectBase({ value, operators, onChange, disabled }: OperatorSelectProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as FilterOperator);
    },
    [onChange],
  );

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      className="px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      aria-label="Filter operator"
    >
      {operators.map((op) => (
        <option key={op} value={op}>
          {OPERATOR_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

export const OperatorSelect = memo(OperatorSelectBase);
