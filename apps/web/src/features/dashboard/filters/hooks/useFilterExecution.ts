'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FuzzingRun } from '@/app/types';
import type { FilterAST } from '../ast/FilterAST';
import { countFilter } from '../execution/executorFactory';

export interface FilterExecutionState {
  results: FuzzingRun[];
  count: number;
  isLoading: boolean;
  duration: number;
  execute: (ast: FilterAST, runs: FuzzingRun[], rowCount?: number) => void;
}

export function useFilterExecution(): FilterExecutionState {
  const [results, _setResults] = useState<FuzzingRun[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const execute = useCallback(
    (ast: FilterAST, runs: FuzzingRun[], rowCount?: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setIsLoading(true);

      debounceRef.current = setTimeout(async () => {
        const start = performance.now();
        const result = await countFilter(runs, ast, rowCount);
        const elapsed = Math.round(performance.now() - start);
        setCount(result.count);
        setDuration(elapsed);
        setIsLoading(false);
      }, 300);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, count, isLoading, duration, execute };
}
