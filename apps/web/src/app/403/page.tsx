'use client';

import Link from 'next/link';
import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '../../components/Logo';
import {
  explainGate,
  getCapability,
  requiredRoleForCapability,
  useEffectiveAccess,
  type CapabilityCode,
} from '../../lib/permissions';

function ForbiddenContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { access, status } = useEffectiveAccess();

  const capability = searchParams.get('capability');
  const from = searchParams.get('from');

  const definition = capability ? getCapability(capability) : undefined;
  const requiredRole = capability ? requiredRoleForCapability(capability as CapabilityCode) : null;
  const role = access?.role ?? null;
  const reason = capability ? explainGate(capability, status, role) : null;
  const subject = access?.principal.subject ?? 'your identity';
  const maintainerCount = access?.maintainerCount ?? null;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <section
      className="flex min-h-[calc(100vh-56px)] items-center justify-center px-5 py-16 sm:px-8 lg:min-h-[calc(100vh-68px)]"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <div className="w-full max-w-2xl text-center">
        <div className="mb-8 flex justify-center">
          <Logo size={52} />
        </div>

        <p
          className="mb-3 font-mono text-xs font-bold tracking-[0.2em] uppercase"
          style={{ color: 'var(--text-secondary)' }}
        >
          Error 403
        </p>
        <h1
          className="text-3xl font-extrabold tracking-tight sm:text-5xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Access denied
        </h1>
        <p
          className="mx-auto mt-5 max-w-xl text-sm leading-6 sm:text-base"
          style={{ color: 'var(--text-secondary)' }}
        >
          {definition
            ? 'The server refused this request because your role does not cover it. Nothing was changed, and the explanation below says exactly what is missing.'
            : 'The server refused this request. Nothing was changed. Use the recovery paths below to get back into CrashLab.'}
        </p>

        {capability && definition && (
          <div
            className="mx-auto mt-8 max-w-xl rounded-xl border p-5 text-left"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)' }}
            data-testid="forbidden-capability"
          >
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Missing capability
            </p>
            <p className="mt-2 text-lg font-bold" data-testid="forbidden-capability-label">
              {definition.label}
            </p>
            <p className="mt-1">
              <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-sm dark:bg-zinc-800" data-testid="forbidden-capability-code">
                {capability}
              </code>
            </p>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {reason}
            </p>
            {requiredRole && (
              <p className="mt-3 text-sm" data-testid="forbidden-required-role">
                This action requires the <strong>{requiredRole}</strong> role
                {role ? (
                  <>
                    {' '}
                    and you are signed in as <strong>{role}</strong>
                  </>
                ) : status === 'loading' ? (
                  ' and your role is still being verified'
                ) : (
                  ''
                )}
                .
              </p>
            )}
          </div>
        )}

        <div
          className="mx-auto mt-5 max-w-xl rounded-xl border p-5 text-left"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)' }}
          data-testid="forbidden-request-access"
        >
          <p className="text-sm font-bold">How to get access</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            Ask a maintainer
            {maintainerCount !== null && maintainerCount >= 0
              ? ` — this deployment has ${maintainerCount} maintainer${maintainerCount === 1 ? '' : 's'} — `
              : ' '}
            to grant <span className="font-mono">{subject}</span>
            {requiredRole ? ` the ${requiredRole} role` : ' the role this action needs'}. They manage
            assignments in Settings → Roles.
          </p>
          {access && !access.principal.authenticated && (
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              You are browsing anonymously.{' '}
              <Link href="/auth/signin" className="font-bold underline hover:no-underline">
                Sign in
              </Link>{' '}
              first so your identity can be granted a role.
            </p>
          )}
          {from && from !== '/403' && from !== '/' && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="forbidden-from">
              Requested page: <span className="font-mono">{from}</span>
            </p>
          )}
        </div>

        <nav className="mt-8 grid gap-3 text-left sm:grid-cols-2" aria-label="Page recovery options">
          <button
            type="button"
            onClick={handleBack}
            data-testid="forbidden-back"
            className="group min-h-24 rounded-xl border px-5 py-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: 'var(--text-primary)',
              backgroundColor: 'var(--text-primary)',
              color: 'var(--bg)',
            }}
          >
            <span className="block text-sm font-bold">Go back</span>
            <span className="mt-1 block text-xs font-normal leading-5">
              Return to where you were — pages you can open stay open.
            </span>
          </button>
          <Link
            href="/"
            prefetch
            className="group min-h-24 rounded-xl border px-5 py-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="block text-sm font-bold">Go home</span>
            <span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--text-secondary)' }}>
              Land on the CrashLab home page and start from there.
            </span>
          </Link>
        </nav>
      </div>
    </section>
  );
}

export default function ForbiddenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-5 py-16 text-sm">
          Loading…
        </div>
      }
    >
      <ForbiddenContent />
    </Suspense>
  );
}
