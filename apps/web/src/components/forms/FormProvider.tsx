// WIP scaffold for issue #2278. Context plumbing only; no navigation guards or conflict
// detection yet.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FieldErrors } from "./validation/zodResolver";

export interface FormContextValue {
  values: Record<string, unknown>;
  errors: FieldErrors;
  setField: (key: string, value: unknown) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function FormProvider({
  value,
  children,
}: {
  value: FormContextValue;
  children: ReactNode;
}) {
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);
  if (!context) throw new Error("useFormContext must be used within a FormProvider");
  return context;
}
