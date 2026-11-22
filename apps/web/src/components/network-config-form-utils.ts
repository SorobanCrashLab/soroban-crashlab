import { validateNetworkUrl } from '../app/network-config-utils';

export type NetworkFormField =
  | 'name'
  | 'networkPassphrase'
  | 'horizonUrl'
  | 'rpcUrl'
  | 'friendbotUrl';

/**
 * Returns a validation error message for a single network form field, or
 * null if the value is valid. Kept separate from the form component so it
 * can be unit tested without rendering React/DOM.
 */
export function getNetworkFieldError(
  field: NetworkFormField,
  value: string,
): string | null {
  switch (field) {
    case 'name': {
      if (!value.trim()) return 'Name is required.';
      if (value.length > 64) return 'Name must be 64 characters or fewer.';
      if (value !== value.trim()) {
        return 'Name must not have leading or trailing whitespace.';
      }
      return null;
    }

    case 'networkPassphrase':
      return value.trim() ? null : 'Network passphrase is required.';

    case 'horizonUrl':
      return validateNetworkUrl(value, 'Horizon URL');

    case 'rpcUrl':
      return validateNetworkUrl(value, 'RPC URL');

    case 'friendbotUrl':
      // Friendbot URL is optional; only validate format if something was entered.
      if (!value.trim()) return null;
      return validateNetworkUrl(value, 'Friendbot URL');

    default:
      return null;
  }
}
