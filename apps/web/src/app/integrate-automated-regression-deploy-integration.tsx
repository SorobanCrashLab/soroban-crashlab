'use client';

/**
 * Issue #253 – Integrate: Automated regression deploy integration
 *
 * Dashboard panel that simulates an end-to-end path: deploy to a target
 * environment, run the regression suite against the deployment, then verify
 * artifact digests and regression deltas. Uses the same visual language as
 * other integration panels (replay, migrations).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

export type RegressionDeployStage =
  | 'idle'
  | 'deploying'
  | 'running_regression'
  | 'verifying_artifacts'
  | 'passed'
  | 'failed';

export interface RegressionDeployIntegrationResult {
  deploymentId: string;
  durationMs: number;
  testsScheduled: number;
  testsPassed: number;
  baselineArtifactDigest: string;
  deployedArtifactDigest: string;
  digestsMatch: boolean;
  regressionDeltaEmpty: boolean;
}

export interface RegressionDeployScenario {
  id: string;
  label: string;
  description: string;
  gitRef: string;
  environment: string;
  suiteName: string;
  stage: RegressionDeployStage;
  errorMessage?: string;
  result?: RegressionDeployIntegrationResult;
}

const INITIAL_SCENARIOS: RegressionDeployScenario[] = [
  {
    id: 'reg-deploy-main-staging',
    label: 'main → staging — full regression',
    description:
      'Continuous deploy from default branch; runs full crash-signature regression against staging RPC.',
    gitRef: 'main@a1b2c3d',
    environment: 'staging',
    suiteName: 'crashlab-regression-full',
    stage: 'idle',
  },
  {
    id: 'reg-deploy-release-canary',
    label: 'release tag → canary — smoke + regression',
    description:
      'Promotes a semver tag to canary slots; smoke tests then bounded regression subset before wide rollout.',
    gitRef: 'v2.4.0',
    environment: 'prod-canary',
    suiteName: 'crashlab-regression-smoke-plus',
    stage: 'idle',
  },
  {
    id: 'reg-deploy-preview',
    label: 'PR preview — differential regression',
    description:
      'Ephemeral preview URL; executes differential suite against prior baseline bundle digest.',
    gitRef: 'feat/soroban-253@e4f5g6h',
    environment: 'preview',
    suiteName: 'crashlab-regression-diff',
    stage: 'idle',
  },
];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function isBusyStage(stage: RegressionDeployStage): boolean {
  return (
    stage === 'deploying' || stage === 'running_regression' || stage === 'verifying_artifacts'
  );
}

function StageStepper({ stage }: { stage: RegressionDeployStage }) {
  const labels = ['Deploy', 'Regression', 'Verify', 'Done'] as const;
  let activeIndex = -1;
  if (stage === 'deploying') activeIndex = 0;
  else if (stage === 'running_regression') activeIndex = 1;
  else if (stage === 'verifying_artifacts') activeIndex = 2;
  else if (stage === 'passed') activeIndex = 3;
  else if (stage === 'failed') activeIndex = 2;

  return (
    <ol className="flex flex-wrap gap-2 mt-3" aria-label="Pipeline stage">
      {labels.map((label, i) => {
        const current = stage !== 'failed' && stage !== 'idle' && activeIndex === i;
        const done =
          stage === 'passed' ||
          (activeIndex > i && stage !== 'failed') ||
          (stage === 'failed' && i < 2);
        const failedHere = stage === 'failed' && i === 2;
        const base =
          'text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors';
        const cls = failedHere
          ? `${base} border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200`
          : current
            ? `${base} border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-100`
            : done
              ? `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200`
              : `${base} border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400`;
        return (
          <li key={label} className={cls}>
            <span className="sr-only">
              Step {i + 1} of {labels.length}:{' '}
            </span>
            {label}
            {failedHere ? ' (failed)' : ''}
            {current ? ' (active)' : ''}
            {done && !current && !failedHere ? ' (complete)' : ''}
          </li>
        );
      })}
    </ol>
  );
}

function StatusGlyph({ stage }: { stage: RegressionDeployStage }) {
  if (isBusyStage(stage)) {
    return (
      <svg className="w-5 h-5 text-indigo-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
  }
  if (stage === 'passed') {
    return (
      <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (stage === 'failed') {
    return (
      <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

export default function AutomatedRegressionDeployIntegration() {
  const [scenarios, setScenarios] = useState<RegressionDeployScenario[]>(() =>
    INITIAL_SCENARIOS.map((s) => ({ ...s })),
  );
  const mounted = useRef(true);
  const scenariosRef = useRef(scenarios);

  useEffect(() => {
    scenariosRef.current = scenarios;
  }, [scenarios]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const updateScenario = useCallback((id: string, patch: Partial<RegressionDeployScenario>) => {
    if (!mounted.current) return;
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const runScenario = useCallback(async (id: string) => {
    const scenario = scenariosRef.current.find((s) => s.id === id);
    if (!scenario || isBusyStage(scenario.stage)) return;

    const started = performance.now();
    const digestBase = `sha256:${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const { suiteName } = scenario;

    try {
      updateScenario(id, { stage: 'deploying', errorMessage: undefined, result: undefined });
      await sleep(520);
      if (!mounted.current) return;

      updateScenario(id, { stage: 'running_regression' });
      await sleep(680);
      if (!mounted.current) return;

      updateScenario(id, { stage: 'verifying_artifacts' });
      await sleep(380);
      if (!mounted.current) return;

      const testsScheduled = suiteName.includes('diff') ? 48 : suiteName.includes('smoke') ? 120 : 312;
      const testsPassed = testsScheduled;
      const durationMs = Math.round(performance.now() - started);
      const deploymentId = `dep-${id}-${Date.now().toString(36)}`;

      const result: RegressionDeployIntegrationResult = {
        deploymentId,
        durationMs,
        testsScheduled,
        testsPassed,
        baselineArtifactDigest: `${digestBase}:baseline`,
        deployedArtifactDigest: `${digestBase}:baseline`,
        digestsMatch: true,
        regressionDeltaEmpty: true,
      };

      updateScenario(id, { stage: 'passed', result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Pipeline failed';
      updateScenario(id, { stage: 'failed', errorMessage: message });
    }
  }, [updateScenario]);

  const runAll = useCallback(async () => {
    const ids = scenariosRef.current.map((s) => s.id);
    for (const scenarioId of ids) {
      const s = scenariosRef.current.find((x) => x.id === scenarioId);
      if (s && !isBusyStage(s.stage)) {
        await runScenario(scenarioId);
      }
    }
  }, [runScenario]);

  const busy = scenarios.some((s) => isBusyStage(s.stage));
  const inProgressCount = scenarios.filter((s) => isBusyStage(s.stage)).length;
  const passed = scenarios.filter((s) => s.stage === 'passed').length;
  const failed = scenarios.filter((s) => s.stage === 'failed').length;

  return (
    <section className="w-full space-y-6" aria-labelledby="regression-deploy-heading">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2
            id="regression-deploy-heading"
            className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Automated regression deploy integration
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            End-to-end check: promote build, execute regression suite on the live target, then confirm artifact
            digests and empty regression deltas before the deploy is considered healthy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Run all pipelines
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-center">
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{passed}</p>
          <p className="text-xs uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
            Passed
          </p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-center">
          <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{failed}</p>
          <p className="text-xs uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
            Failed
          </p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-center">
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{inProgressCount}</p>
          <p className="text-xs uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
            In progress
          </p>
        </div>
      </div>

      <ul className="space-y-3 list-none p-0 m-0">
        {scenarios.map((s) => (
          <li
            key={s.id}
            className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden"
          >
            <article className="flex flex-col sm:flex-row sm:items-stretch gap-0">
              <div className="flex items-start gap-4 px-5 py-4 flex-1 min-w-0">
                <StatusGlyph stage={s.stage} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{s.label}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{s.description}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    <div>
                      <dt className="sr-only">Git ref</dt>
                      <dd>ref {s.gitRef}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Environment</dt>
                      <dd>env {s.environment}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Suite</dt>
                      <dd>{s.suiteName}</dd>
                    </div>
                  </dl>
                  {(isBusyStage(s.stage) || s.stage === 'failed') && <StageStepper stage={s.stage} />}
                  {s.stage === 'failed' && s.errorMessage ? (
                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-2" role="alert">
                      {s.errorMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex sm:flex-col justify-end gap-2 px-5 py-4 sm:border-l border-zinc-100 dark:border-zinc-800 sm:min-w-[8.5rem]">
                <button
                  type="button"
                  onClick={() => void runScenario(s.id)}
                  disabled={isBusyStage(s.stage)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isBusyStage(s.stage) ? 'Running…' : 'Run pipeline'}
                </button>
              </div>
            </article>

            {s.result ? (
              <footer className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Deployment{' '}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">{s.result.deploymentId}</span>
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Tests{' '}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {s.result.testsPassed}/{s.result.testsScheduled}
                    </span>
                  </span>
                  <span
                    className={
                      s.result.digestsMatch
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    Digests {s.result.digestsMatch ? 'match' : 'diverged'}
                  </span>
                  <span
                    className={
                      s.result.regressionDeltaEmpty
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    Regression delta {s.result.regressionDeltaEmpty ? 'empty' : 'non-empty'}
                  </span>
                  <span className="text-zinc-400">{s.result.durationMs}ms</span>
                </div>
                <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mt-2 truncate" title={s.result.deployedArtifactDigest}>
                  {s.result.deployedArtifactDigest}
                </p>
              </footer>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
