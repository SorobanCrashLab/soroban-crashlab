// WIP scaffold for issue #2278. Maps a server error envelope ({ error, code?, fields? })
// onto the field-error shape used by zodResolver. Shape is a guess pending a real API contract.
import type { FieldErrors } from "./zodResolver";

export interface ServerErrorResponse {
  error: string;
  code?: string;
  fields?: Record<string, string>;
}

export function mapServerErrors(response: ServerErrorResponse): FieldErrors {
  return { ...response.fields, _form: response.fields ? undefined : response.error };
}
