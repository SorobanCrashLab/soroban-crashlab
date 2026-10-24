/**
 * Shared form-error association for W5-H09 (#1884).
 *
 * The pattern: a field's message element gets a stable id, the control points
 * at it with both `aria-describedby` and `aria-errormessage`, and helper text
 * is only referenced while it is actually rendered. That last part matters:
 * the previous components kept the helper id in `aria-describedby` even when
 * the helper paragraph was replaced by the error, leaving a dangling IDREF.
 */

export interface FieldErrorInput {
  id: string;
  error?: unknown;
  helperText?: unknown;
}

export interface FieldA11yProps {
  errorId: string | null;
  helperId: string | null;
  inputProps: {
    'aria-invalid'?: true;
    'aria-describedby'?: string;
    'aria-errormessage'?: string;
  };
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === '') return false;
  return true;
}

export function getFieldA11yProps({ id, error, helperText }: FieldErrorInput): FieldA11yProps {
  const hasError = hasContent(error);
  const hasHelper = !hasError && hasContent(helperText);
  const errorId = hasError ? `${id}-error` : null;
  const helperId = hasHelper ? `${id}-helper` : null;
  const describedBy = [errorId, helperId].filter((value): value is string => value !== null).join(' ');

  return {
    errorId,
    helperId,
    inputProps: {
      ...(hasError ? { 'aria-invalid': true as const } : {}),
      ...(describedBy.length > 0 ? { 'aria-describedby': describedBy } : {}),
      ...(errorId ? { 'aria-errormessage': errorId } : {}),
    },
  };
}
