/**
 * View sharing utilities (#2194).
 *
 * Generates shareable URLs encoding the full filter AST and parses
 * them back. The URL is compressed to stay under the 2000 char limit.
 */

import type { FilterAST } from '../ast/FilterAST';
import { buildShareableURL, extractFilterASTFromURL, isURLWithinLimit } from '../url/FilterURLCodec';
import type { ViewVisibility } from './SavedViewStore';

export function generateShareLink(ast: FilterAST): string {
  if (typeof window === 'undefined') return '';
  const baseUrl = window.location.origin + window.location.pathname;
  return buildShareableURL(baseUrl, ast);
}

export function parseShareLink(url: string): FilterAST | null {
  return extractFilterASTFromURL(url);
}

export function validateShareLink(url: string): { valid: boolean; tooLong: boolean; ast: FilterAST | null } {
  const ast = parseShareLink(url);
  return {
    valid: ast !== null,
    tooLong: !isURLWithinLimit(url),
    ast,
  };
}

export const VISIBILITY_LABELS: Record<ViewVisibility, string> = {
  private: 'Private',
  team: 'Team',
  public: 'Public',
};
