/**
 * Utility helpers for the ConfirmDialog component.
 *
 * Keeping decision logic outside of the component lets us unit-test it without
 * a DOM environment and reuse it across different trigger sites.
 */

export type DestructiveAction = 'delete-run' | 'delete-runs' | 'reset-config' | 'revoke-token';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: 'danger' | 'warning' | 'info';
}

/**
 * Returns the dialog configuration (title, message, button labels, variant)
 * for a given destructive action. The `count` parameter is used for bulk
 * operations where the message should reflect how many items are affected.
 */
export function getConfirmDialogConfig(
  action: DestructiveAction,
  count = 1,
): ConfirmDialogConfig {
  switch (action) {
    case 'delete-run':
      return {
        title: 'Delete Run',
        message:
          'Are you sure you want to delete this run? This action cannot be undone and all associated data will be permanently removed.',
        confirmText: 'Delete Run',
        cancelText: 'Cancel',
        variant: 'danger',
      };

    case 'delete-runs':
      return {
        title: `Delete ${count} Run${count !== 1 ? 's' : ''}`,
        message:
          count === 1
            ? 'Are you sure you want to delete this run? This action cannot be undone and all associated data will be permanently removed.'
            : `Are you sure you want to delete ${count} runs? This action cannot be undone and all associated data will be permanently removed.`,
        confirmText: `Delete ${count} Run${count !== 1 ? 's' : ''}`,
        cancelText: 'Cancel',
        variant: 'danger',
      };

    case 'reset-config':
      return {
        title: 'Reset to Defaults',
        message:
          'This will clear all API configuration including the backend URL and rate limit settings, and restore the original defaults. Any unsaved drafts will also be discarded.',
        confirmText: 'Reset to Defaults',
        cancelText: 'Cancel',
        variant: 'warning',
      };

    case 'revoke-token':
      return {
        title: 'Revoke API Token',
        message:
          'Are you sure you want to revoke this API token? Any applications using this token will immediately lose access.',
        confirmText: 'Revoke Token',
        cancelText: 'Cancel',
        variant: 'danger',
      };
  }
}

/**
 * Returns true when the action requires a confirmation dialog before
 * proceeding. Non-destructive actions (export, tag, assign) return false.
 */
export function requiresConfirmation(action: string): boolean {
  return action === 'delete' || action === 'delete-run' || action === 'delete-runs' || action === 'reset-config' || action === 'revoke-token';
}

/**
 * Formats the summary line shown in the bulk-action toolbar after runs are
 * selected. Exposed here to keep presentation logic out of the component.
 */
export function formatRunSelectionSummary(runIds: string[], maxInline = 5): string {
  if (runIds.length === 0) return '';
  const inline = runIds.slice(0, maxInline).join(', ');
  const overflow = runIds.length - maxInline;
  return overflow > 0 ? `${inline} and ${overflow} more…` : inline;
}
