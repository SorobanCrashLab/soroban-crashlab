'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { NetworkConfig } from '../app/network-config-utils';
import { getNetworkFieldError, type NetworkFormField } from './network-config-form-utils';

interface FormState {
  name: string;
  networkPassphrase: string;
  horizonUrl: string;
  rpcUrl: string;
  friendbotUrl: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  networkPassphrase: '',
  horizonUrl: '',
  rpcUrl: '',
  friendbotUrl: '',
};

const FIELDS: { field: NetworkFormField; label: string; placeholder: string }[] = [
  { field: 'name', label: 'Network Name', placeholder: 'My Custom Network' },
  {
    field: 'networkPassphrase',
    label: 'Network Passphrase',
    placeholder: 'Test SDF Network ; September 2015',
  },
  { field: 'horizonUrl', label: 'Horizon URL', placeholder: 'https://horizon-testnet.stellar.org' },
  { field: 'rpcUrl', label: 'RPC URL', placeholder: 'https://soroban-testnet.stellar.org' },
  {
    field: 'friendbotUrl',
    label: 'Friendbot URL (optional)',
    placeholder: 'https://friendbot.stellar.org',
  },
];

const dangerStyle = { color: '#CC1016' };
const successStyle = { color: '#057642' };

export default function NetworkConfigForm() {
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [activeNetworkId, setActiveNetworkId] = useState<string>('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<NetworkFormField, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<NetworkFormField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);

  const loadNetworks = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/networks');
      const json = await res.json();
      if (!res.ok) {
        setListError(json?.error ?? 'Failed to load networks.');
        return;
      }
      setNetworks(json.data.networks ?? []);
      setActiveNetworkId(json.data.activeNetworkId ?? '');
    } catch {
      setListError('Failed to load networks. Check your connection and try again.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadNetworks();
    });
  }, [loadNetworks]);

  const handleChange = useCallback((field: NetworkFormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveState('idle');
    // Re-validate immediately if the field has already been blurred once,
    // so corrections are reflected without needing another blur.
    setErrors((prev) => {
      if (!prev[field] && !touched[field]) return prev;
      const error = getNetworkFieldError(field, value);
      return { ...prev, [field]: error ?? undefined };
    });
  }, [touched]);

  const handleBlur = useCallback((field: NetworkFormField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({
      ...prev,
      [field]: getNetworkFieldError(field, form[field]) ?? undefined,
    }));
  }, [form]);

  const validateAll = useCallback((): Partial<Record<NetworkFormField, string>> => {
    const next: Partial<Record<NetworkFormField, string>> = {};
    for (const { field } of FIELDS) {
      const error = getNetworkFieldError(field, form[field]);
      if (error) next[field] = error;
    }
    return next;
  }, [form]);

  const hasErrors = useMemo(
    () => Object.values(errors).some(Boolean),
    [errors],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const allErrors = validateAll();
      setErrors(allErrors);
      setTouched({
        name: true,
        networkPassphrase: true,
        horizonUrl: true,
        rpcUrl: true,
        friendbotUrl: true,
      });

      if (Object.keys(allErrors).length > 0) return;

      setSubmitting(true);
      try {
        const payload: Record<string, string> = {
          name: form.name.trim(),
          networkPassphrase: form.networkPassphrase.trim(),
          horizonUrl: form.horizonUrl.trim(),
          rpcUrl: form.rpcUrl.trim(),
        };
        if (form.friendbotUrl.trim()) {
          payload.friendbotUrl = form.friendbotUrl.trim();
        }

        const res = await fetch('/api/networks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok) {
          setSubmitError(json?.error ?? 'Failed to add network.');
          setSaveState('error');
          return;
        }

        setForm(EMPTY_FORM);
        setTouched({});
        setErrors({});
        setSaveState('saved');
        await loadNetworks();
      } catch {
        setSubmitError('Failed to add network. Check your connection and try again.');
        setSaveState('error');
      } finally {
        setSubmitting(false);
      }
    },
    [form, validateAll, loadNetworks],
  );

  const setActive = useCallback(
    async (id: string) => {
      try {
        const res = await fetch('/api/networks/active', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (res.ok) {
          await loadNetworks();
        }
      } catch {
        // Network list refresh will simply retain the previous active id;
        // the user can retry from the list.
      }
    },
    [loadNetworks],
  );

  const deleteNetwork = useCallback(
    async (id: string, name: string) => {
      const ok = window.confirm(`Remove network "${name}"? This cannot be undone.`);
      if (!ok) return;
      try {
        const res = await fetch(`/api/networks/${id}`, { method: 'DELETE' });
        if (res.ok) {
          await loadNetworks();
        }
      } catch {
        // Leave the list as-is; the user can retry.
      }
    },
    [loadNetworks],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-page">Network Configuration</h1>
        <p className="text-meta mt-1">
          Manage Stellar network endpoints (Horizon and RPC URLs) used to connect to mainnet,
          testnet, futurenet, or a custom network.
        </p>
      </div>

      <div className="card card-padding">
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          Configured Networks
        </h3>

        {listLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-5 rounded" />
            ))}
          </div>
        )}

        {!listLoading && listError && (
          <p className="text-sm" style={dangerStyle}>
            {listError}
          </p>
        )}

        {!listLoading && !listError && (
          <div className="space-y-2">
            {networks.map((network) => (
              <div key={network.id} className="flex-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-sm-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {network.name}
                    {network.id === activeNetworkId && (
                      <span className="ml-2 text-xs font-semibold" style={successStyle}>
                        Active
                      </span>
                    )}
                  </p>
                  <p className="text-meta text-xs truncate">{network.rpcUrl}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {network.id !== activeNetworkId && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ height: '30px', fontSize: '12px', padding: '0 10px' }}
                      onClick={() => setActive(network.id)}
                    >
                      Set active
                    </button>
                  )}
                  {!network.isBuiltIn && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ height: '30px', fontSize: '12px', padding: '0 10px', ...dangerStyle }}
                      onClick={() => deleteNetwork(network.id, network.name)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        id="network-config-form"
        className="card card-padding space-y-5"
        noValidate
        onSubmit={handleSubmit}
      >
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
          Add Network
        </h3>

        {FIELDS.map(({ field, label, placeholder }) => (
          <div key={field}>
            <label htmlFor={`network-${field}`} className="input-label">
              {label}
            </label>
            <input
              id={`network-${field}`}
              className="input-field mt-1"
              placeholder={placeholder}
              value={form[field]}
              onChange={(e) => handleChange(field, e.target.value)}
              onBlur={() => handleBlur(field)}
            />
            {touched[field] && errors[field] && (
              <p className="text-xs mt-1" style={dangerStyle}>
                {errors[field]}
              </p>
            )}
          </div>
        ))}

        {submitError && (
          <p className="text-sm" style={dangerStyle}>
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {saveState === 'saved' && (
            <span className="text-sm-semibold" style={successStyle}>
              Added
            </span>
          )}
          <button
            id="network-config-save"
            type="submit"
            className="btn-primary"
            disabled={submitting || (hasErrors && Object.values(touched).some(Boolean))}
            style={{ height: '36px', fontSize: '14px', padding: '0 20px' }}
          >
            {submitting ? 'Adding…' : 'Add network'}
          </button>
        </div>
      </form>
    </div>
  );
}
