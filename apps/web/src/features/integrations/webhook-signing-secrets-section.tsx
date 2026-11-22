'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getConfirmDialogConfig } from '../../components/confirm-dialog-utils';

export interface SigningSecretView {
  id: string;
  keyId: string;
  status: 'active' | 'grace';
  createdAt: string;
  expiresAt?: string;
}

/**
 * Webhook signing-secret rotation surface (#1663).
 *
 * Lists the signing-secret records (status, key-id, grace countdown), rotates
 * the active secret with zero-downtime dual-accept, and revokes grace secrets
 * early. The new secret is disclosed exactly once in a copyable panel after a
 * rotation — mirroring the API-token rotate contract.
 */
export default function WebhookSigningSecretsSection() {
  const [records, setRecords] = useState<SigningSecretView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const [rotateOpen, setRotateOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<{ secret: string; keyId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/webhooks/signing-secrets');
      if (res.ok) {
        const data = await res.json();
        setRecords((data.data?.records as SigningSecretView[]) ?? []);
        setError(null);
      } else {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load signing secrets.');
      }
    } catch {
      setError('Failed to load signing secrets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetchRecords().then(() => {
        if (mounted) setNowMs(Date.now());
      });
    };
    // Defer the initial fetch out of the effect body (repo lint contract:
    // `react-hooks/set-state-in-effect`).
    const timeoutId = setTimeout(load, 0);
    const interval = window.setInterval(() => {
      if (mounted) setNowMs(Date.now());
    }, 30_000);
    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(interval);
    };
  }, [fetchRecords]);

  const confirmRotate = async () => {
    if (isRotating) return;
    setIsRotating(true);
    try {
      const res = await fetch('/api/webhooks/signing-secrets/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Rotation failed.');
        return;
      }
      setRotatedSecret({
        secret: typeof data?.data?.secret === 'string' ? data.data.secret : '',
        keyId: typeof data?.data?.keyId === 'string' ? data.data.keyId : 'unknown',
      });
      setRecords((data.data?.records as SigningSecretView[]) ?? []);
      setError(null);
      setNowMs(Date.now());
    } catch {
      setError('Rotation request failed.');
    } finally {
      setIsRotating(false);
      setRotateOpen(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget || isRevoking) return;
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/webhooks/signing-secrets/${encodeURIComponent(revokeTarget)}/revoke-grace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Revocation failed.');
        return;
      }
      setRecords((data.data?.records as SigningSecretView[]) ?? []);
      setError(null);
      setNowMs(Date.now());
    } catch {
      setError('Revocation request failed.');
    } finally {
      setIsRevoking(false);
      setRevokeTarget(null);
    }
  };

  const copySecret = async () => {
    if (!rotatedSecret?.secret) return;
    try {
      await navigator.clipboard.writeText(rotatedSecret.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const graceRemaining = (record: SigningSecretView) => {
    if (record.status !== 'grace' || !record.expiresAt) return null;
    if (nowMs === 0) return null;
    const remainingMs = new Date(record.expiresAt).getTime() - nowMs;
    if (remainingMs <= 0) return 'expired';
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  };

  const active = records.find((record) => record.status === 'active');

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Webhook Signing Secrets</h2>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Loading signing-secret records…</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Webhook Signing Secrets</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Outbound deliveries sign with the active secret; inbound verification accepts the active and grace secrets
            until each grace window lapses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRotateOpen(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 dark:focus:ring-offset-zinc-900"
        >
          Rotate Signing Secret
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {rotatedSecret && (
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            New signing secret — copy it now, it will not be shown again
          </h3>
          <div className="mt-3 flex items-center gap-3">
            <code
              data-testid="rotated-secret"
              className="min-w-0 flex-1 truncate rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-emerald-900 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-200"
            >
              {rotatedSecret.secret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
            Key id <code className="font-mono">{rotatedSecret.keyId}</code> — each outbound delivery carries a{' '}
            <code className="font-mono">X-Webhook-Key-Id</code> request header so your endpoint can tell which secret
            signed it.
          </p>
        </div>
      )}

      {(records.length === 0 && !error) ? (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          No signing secrets configured. Set <code className="font-mono">CRASHLAB_WEBHOOK_SIGNING_SECRETS</code> to seed the first record.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Key ID</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Created</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Grace window</th>
                <th scope="col" className="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="py-3 pr-4">
                    <span
                      className={
                        record.status === 'active'
                          ? 'inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300'
                          : 'inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300'
                      }
                    >
                      {record.status === 'active' ? 'Active' : 'Grace'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {record.keyId}
                    {record.id === active?.id && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">signs outbound</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(record.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500 dark:text-zinc-400">
                    {record.status === 'grace' ? graceRemaining(record) : '—'}
                  </td>
                  <td className="py-3 text-right">
                    {record.status === 'grace' && (
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(record.keyId)}
                        className="rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={rotateOpen}
        {...getConfirmDialogConfig('rotate-signing-secret')}
        isLoading={isRotating}
        onConfirm={confirmRotate}
        onCancel={() => setRotateOpen(false)}
      />

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        {...getConfirmDialogConfig('revoke-signing-secret')}
        isLoading={isRevoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </section>
  );
}