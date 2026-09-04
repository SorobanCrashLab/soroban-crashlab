'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { getConfirmDialogConfig } from '../../../components/confirm-dialog-utils';
import { ApiTokenPublic, ApiTokenScope } from '../../../lib/storage/api-token-store';

export default function ApiTokenManager() {
  const [tokens, setTokens] = useState<ApiTokenPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);

  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/tokens');
      if (res.ok) {
        const data = await res.json();
        setTokens(data.data?.tokens || []);
      }
    } catch {
      // Ignore network errors in mock mode
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const res = await fetch('/api/settings/tokens');
        if (res.ok && mounted) {
          const data = await res.json();
          setTokens(data.data?.tokens || []);
        }
      } catch {
        // Ignore
      } finally {
        if (mounted) {
          setLoading(false);
          setNowMs(Date.now());
        }
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Token name is required.');
      return;
    }

    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scope,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create token.');
        return;
      }

      setCreatedSecret(data.data?.secret ?? null);
      setName('');
      setExpiresAt('');
      fetchTokens();
    } catch {
      setError('An unexpected error occurred while creating token.');
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTargetId) return;
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/settings/tokens/${revokeTargetId}/revoke`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchTokens();
      }
    } catch {
      // Ignore
    } finally {
      setIsRevoking(false);
      setRevokeTargetId(null);
    }
  };

  const copySecret = () => {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTokenStatus = (token: ApiTokenPublic, referenceMs: number) => {
    if (token.revokedAt) return { label: 'Revoked', chipClass: 'bg-red-500/10 text-red-400 border-red-500/20' };
    if (token.expiresAt && referenceMs > 0 && new Date(token.expiresAt).getTime() <= referenceMs) {
      return { label: 'Expired', chipClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    }
    return { label: 'Active', chipClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
  };

  return (
    <div className="card card-padding space-y-6 mt-6" id="api-token-manager">
      <div>
        <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          Scoped API Tokens
        </h2>
        <p className="text-meta text-xs mt-1">
          Create and manage scoped API tokens for automated CI/CD and integrations.
        </p>
      </div>

      {createdSecret && (
        <div className="p-4 rounded border border-emerald-500/30 bg-emerald-500/10 space-y-2" id="created-secret-banner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Token Created Successfully!</span>
            <span className="text-xs text-meta">Save this secret key now. It will NOT be shown again.</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-black/40 px-3 py-1.5 rounded text-xs font-mono text-emerald-300 select-all overflow-x-auto">
              {createdSecret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="btn-outline text-xs px-3 py-1.5"
            >
              {copied ? 'Copied!' : 'Copy Secret'}
            </button>
            <button
              type="button"
              onClick={() => setCreatedSecret(null)}
              className="text-xs text-meta hover:text-white px-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4 pt-2 border-t border-slate-700/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-meta">Create New Token</h3>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="input-label" htmlFor="token-name">Name</label>
            <input
              id="token-name"
              type="text"
              className="input-field mt-1"
              placeholder="e.g. CI Automation Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="token-scope">Scope</label>
            <select
              id="token-scope"
              className="input-field mt-1"
              value={scope}
              onChange={(e) => setScope(e.target.value as ApiTokenScope)}
            >
              <option value="read">Read (Read-only access)</option>
              <option value="write">Write (Full mutation access)</option>
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="token-expiry">Expiration (Optional)</label>
            <input
              id="token-expiry"
              type="date"
              className="input-field mt-1"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary text-xs px-4 py-2" id="create-token-submit">
            Create API Token
          </button>
        </div>
      </form>

      <div className="space-y-3 pt-2 border-t border-slate-700/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-meta">Active API Tokens</h3>
        {loading ? (
          <p className="text-xs text-meta">Loading tokens...</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-meta italic">No API tokens generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" id="api-tokens-table">
              <thead>
                <tr className="border-b border-slate-700/50 text-meta">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Scope</th>
                  <th className="py-2 px-3">Masked Key</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Created</th>
                  <th className="py-2 px-3">Last Used</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => {
                  const status = getTokenStatus(token, nowMs);
                  return (
                    <tr key={token.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="py-2.5 px-3 font-medium text-white">{token.name}</td>
                      <td className="py-2.5 px-3">
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {token.scope}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{token.prefixMasked}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.chipClass}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(token.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!token.revokedAt && (
                          <button
                            type="button"
                            onClick={() => setRevokeTargetId(token.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(() => {
        const dialogConfig = getConfirmDialogConfig('revoke-token');
        return (
          <ConfirmDialog
            isOpen={revokeTargetId !== null}
            title={dialogConfig.title}
            message={dialogConfig.message}
            confirmText={dialogConfig.confirmText}
            cancelText={dialogConfig.cancelText}
            variant={dialogConfig.variant}
            isLoading={isRevoking}
            onConfirm={handleConfirmRevoke}
            onCancel={() => setRevokeTargetId(null)}
          />
        );
      })()}
    </div>
  );
}
