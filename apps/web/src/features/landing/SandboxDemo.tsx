'use client';

/**
 * features/landing/SandboxDemo — canned campaign replay (#1669).
 * Dependency-free (SVG sparkline only, no recharts). Timeline animation with
 * play/pause, reduced-motion aware (renders final frame statically when the
 * OS prefers reduced motion or motion pref is set), deterministic frames for
 * snapshot tests. Decorative visuals are aria-hidden; status uses aria-live.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SANDBOX_CRASH, SANDBOX_FRAMES } from '../../fixtures/sandbox-campaign';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (document.documentElement.getAttribute('data-motion') === 'reduced') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function frameAt(index: number) {
  return SANDBOX_FRAMES[Math.min(Math.max(0, index), SANDBOX_FRAMES.length - 1)];
}

export default function SandboxDemo() {
  const [frameIndex, setFrameIndex] = useState(SANDBOX_FRAMES.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frame = useMemo(() => frameAt(frameIndex), [frameIndex]);
  const crashed = frame.crashes > 0;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setFrameIndex(SANDBOX_FRAMES.length - 1);
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setFrameIndex((i) => {
        if (i >= SANDBOX_FRAMES.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 600);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const points = SANDBOX_FRAMES.map((f, i) => `${(i / (SANDBOX_FRAMES.length - 1)) * 200},${60 - f.coveragePct * 0.7}`).join(' ');

  return (
    <div data-testid="sandbox-demo" className="rounded-xl p-6" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Sandbox replay · canned campaign</p>
        <button
          type="button"
          onClick={() => (playing ? setPlaying(false) : (setFrameIndex(0), setPlaying(true)))}
          aria-pressed={playing}
          aria-label={playing ? 'Pause demo' : 'Play demo'}
          className="btn-outline text-xs"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4" aria-hidden="true">
        {[
          { label: 'seeds', value: String(frame.seeds) },
          { label: 'coverage', value: `${frame.coveragePct}%` },
          { label: 'crashes', value: String(frame.crashes) },
        ].map((s) => (
          <div key={s.label}>
            <div className="stat-value text-lg">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 200 60" className="w-full h-14 mb-3" aria-hidden="true" focusable="false">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p className="code-text text-xs mb-2" aria-hidden="true">{frame.log}</p>
      <div aria-live="polite" className="sr-only">{crashed ? `Crash found: ${SANDBOX_CRASH.signature}` : `Replaying frame ${frameIndex + 1}`}</div>
      {crashed && (
        <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--highlight-bg)' }}>
          <p className="font-bold">Crash: {SANDBOX_CRASH.failureCategory}</p>
          <p className="code-text break-all">{SANDBOX_CRASH.signature}</p>
          <p className="code-text mt-1">{SANDBOX_CRASH.reproducer}</p>
        </div>
      )}
    </div>
  );
}
