'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { sentryAdapter } from '@/lib/integrations/sentry-client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    sentryAdapter.captureException(error, {
      boundary: 'global-error',
      digest: error?.digest ?? 'unknown',
      source: 'app-root',
    });
    console.error('[Global Error]', error);
  }, [error]);

  const digest = error?.digest ?? 'unknown';
  const message = error?.message ?? 'An unknown application error occurred.';

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0b0b',
          color: '#f5f5f5',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            width: 'min(100%, 560px)',
            padding: '32px 24px',
            margin: '24px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '18px',
            background: 'rgba(17,17,17,0.96)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#9ca3af',
            }}
          >
            CrashLab
          </p>

          <h1 style={{ margin: '12px 0 8px', fontSize: 'clamp(2rem, 4vw, 2.6rem)', lineHeight: 1.1 }}>
            Something went wrong
          </h1>

          <p style={{ margin: 0, color: '#d1d5db', fontSize: '15px', lineHeight: 1.6 }}>
            A fatal application error stopped the app before it could recover. Try reloading or return to the dashboard.
          </p>

          <div style={{ marginTop: '18px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: 'none',
                borderRadius: '999px',
                background: '#f5f5f5',
                color: '#111111',
                padding: '10px 18px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={reset}
              style={{
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '999px',
                background: 'transparent',
                color: '#f5f5f5',
                padding: '10px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <Link
              href="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#f5f5f5',
                padding: '10px 18px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Dashboard
            </Link>
          </div>

          <div
            style={{
              marginTop: '20px',
              borderTop: '1px solid rgba(255,255,255,0.12)',
              paddingTop: '18px',
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Error digest
            </p>
            <code
              style={{
                display: 'block',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              {digest}
            </code>
            <p
              style={{
                marginTop: '12px',
                marginBottom: 0,
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(248,113,113,0.2)',
                color: '#fecaca',
                fontSize: '12px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
              role="alert"
            >
              {message}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
