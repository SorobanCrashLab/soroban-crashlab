'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FilterAST } from '../ast/FilterAST';
import { createEmptyAST } from '../ast/FilterAST';
import { encodeFilterAST, decodeFilterAST as _decodeFilterAST, extractFilterASTFromURL } from '../url/FilterURLCodec';

const PARAM_NAME = 'f';

export function useFilterURLSync() {
  const [ast, setAST] = useState<FilterAST>(createEmptyAST());
  const [initialized, setInitialized] = useState(false);

  // Read from URL on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const decoded = extractFilterASTFromURL(url);
    if (decoded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in this hook
      setAST(decoded);
    }
    setInitialized(true);
  }, []);

  // Update URL when AST changes.
  const updateAST = useCallback(
    (next: FilterAST) => {
      setAST(next);
      if (typeof window === 'undefined' || !initialized) return;
      const encoded = encodeFilterAST(next);
      const url = new URL(window.location.href);
      if (encoded) {
        url.searchParams.set(PARAM_NAME, encoded);
      } else {
        url.searchParams.delete(PARAM_NAME);
      }
      window.history.replaceState(null, '', url.toString());
    },
    [initialized],
  );

  return { ast, setAST: updateAST };
}
