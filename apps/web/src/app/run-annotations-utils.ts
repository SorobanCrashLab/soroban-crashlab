/**
 * Utility functions for run annotation management.
 */

export const MAX_ANNOTATION_LENGTH = 500;

export interface AnnotationResult {
  success: boolean;
  annotations: string[];
  error?: string;
}

/**
 * Validates an annotation string before adding it.
 */
export function validateAnnotation(text: string): { valid: boolean; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, error: 'Annotation cannot be empty' };
  }
  if (trimmed.length > MAX_ANNOTATION_LENGTH) {
    return { valid: false, error: `Annotation exceeds ${MAX_ANNOTATION_LENGTH} character limit` };
  }
  return { valid: true };
}

/**
 * Adds a new annotation to an existing list after validation.
 */
export function addAnnotation(existing: string[], text: string): AnnotationResult {
  const validation = validateAnnotation(text);
  if (!validation.valid) {
    return { success: false, annotations: existing, error: validation.error };
  }
  return { success: true, annotations: [...existing, text.trim()] };
}

/**
 * Removes an annotation at the given index.
 */
export function removeAnnotation(existing: string[], index: number): string[] {
  if (index < 0 || index >= existing.length) return existing;
  return existing.filter((_, i) => i !== index);
}
