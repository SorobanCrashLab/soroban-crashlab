// WIP scaffold for issue #2278 (Advanced Form System). TODO: integrate with a form library
// (react-hook-form or equivalent) once one is added as a dependency.
import type { z } from "zod";

export interface FieldErrors {
  [field: string]: string | undefined;
}

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  values: unknown,
): { success: true; data: T } | { success: false; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
