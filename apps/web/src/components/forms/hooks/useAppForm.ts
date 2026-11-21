// WIP scaffold for issue #2278. Plain-React-state implementation; does not yet provide
// the re-render performance of a dedicated form library for 100+ field forms.
"use client";

import { useState } from "react";
import type { z } from "zod";
import { validateWithSchema, type FieldErrors } from "../validation/zodResolver";

export function useAppForm<T extends Record<string, unknown>>(schema: z.ZodType<T>, initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function validate(): boolean {
    const result = validateWithSchema(schema, values);
    if (!result.success) {
      setErrors(result.errors);
      return false;
    }
    setErrors({});
    return true;
  }

  return { values, setField, errors, isDirty, validate };
}
