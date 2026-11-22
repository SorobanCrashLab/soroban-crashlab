'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMaintainerMode } from '../../useMaintainerMode';
import { createLocalConfigBundleGateway } from './bundle-gateway';
import { commitImport, exportBundle, prepareImport, type ImportPreparation } from './bundle-pipeline';
import { createEmptyBundle, SECTION_LABEL, type ConfigBundle } from './bundle-schema';

const EXPORT_FILENAME = 'crashlab-config-bundle.json';

export default function ConfigBundlePanel() {
  const { isMaintainer, mounted } = useMaintainerMode();
  const gateway = useMemo(() => createLocalConfigBundleGateway(), []);

  const [pasted, setPasted] = useState('');
  const [preparation, setPreparation] = useState<ImportPreparation | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const current: ConfigBundle = mounted ? gateway.read() : createEmptyBundle();

  const handleExport = () => {
    const blob = new Blob([exportBundle(gateway)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = EXPORT_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
    setResult(`Exported ${EXPORT_FILENAME}.`);
  };

  const validate = useCallback(
    (text: string) => {
      setResult(null);
      setPreparation(prepareImport(text, current));
    },
    [current],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setPasted(text);
    validate(text);
  };

  const handleCommit = () => {
    if (!preparation || preparation.status !== 'ready') return;
    const outcome = commitImport(gateway, preparation.bundle);
    if (outcome.ok) {
      setResult('Bundle imported. All sections applied.');
      setPreparation(null);
      setPasted('');
    } else {
      setResult(outcome.error);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card card-padding">
        <h2 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          Export
        </h2>
        <p className="text-meta text-sm mb-4">
          Downloads alert rules, channel preferences, and filter presets as one versioned JSON
          file. Keys are written in a stable order, so re-exporting unchanged configuration
          produces an identical file.
        </p>
        <button type="button" onClick={handleExport} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: '#111111' }}>
          Export bundle
        </button>
      </section>

      <section className="card card-padding">
        <h2 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          Import
        </h2>

        {mounted && !isMaintainer ? (
          <p className="text-meta text-sm">
            Importing a bundle overwrites this environment&apos;s configuration, so it is limited to
            maintainer mode. Enable it in Settings to continue.
          </p>
        ) : (
          <>
            <p className="text-meta text-sm mb-4">
              Load a file or paste one below. Nothing is written until you review the diff and
              commit — older bundle versions are migrated forward first.
            </p>

            <input
              type="file"
              accept="application/json"
              aria-label="Bundle file"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              className="mb-3 block text-sm"
            />

            <label htmlFor="bundle-paste" className="sr-only">
              Paste bundle JSON
            </label>
            <textarea
              id="bundle-paste"
              rows={5}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder='{"version": 1, "sections": { … }}'
              className="w-full rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => validate(pasted)}
                disabled={pasted.trim().length === 0}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
              >
                Validate & preview
              </button>
              {preparation?.status === 'ready' && (
                <button
                  type="button"
                  onClick={handleCommit}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: '#444444' }}
                >
                  Commit all sections
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {preparation?.status === 'invalid' && (
        <section role="alert" className="card card-padding border border-red-200 dark:border-red-900">
          <h3 className="font-semibold text-sm text-red-700 dark:text-red-300">
            Bundle rejected — nothing was changed
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">
            {preparation.errors.map((error) => (
              <li key={error} className="font-mono">
                {error}
              </li>
            ))}
          </ul>
        </section>
      )}

      {preparation?.status === 'ready' && (
        <section className="card card-padding">
          <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Preview
          </h3>
          <p className="text-meta text-xs mb-4">
            {preparation.diff.totalAdded} added · {preparation.diff.totalChanged} changed ·{' '}
            {preparation.diff.totalRemoved} removed
            {preparation.migrationsApplied.length > 0 &&
              ` · migrated from v${preparation.migrationsApplied[0]}`}
          </p>

          <ul className="space-y-2">
            {preparation.diff.sections.map((section) => (
              <li key={section.section} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((open) => (open === section.section ? null : section.section))
                  }
                  aria-expanded={expanded === section.section}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold"
                >
                  <span>{SECTION_LABEL[section.section]}</span>
                  <span className="text-meta text-xs">
                    +{section.added.length} · ~{section.changed.length} · −{section.removed.length}
                  </span>
                </button>

                {expanded === section.section && (
                  <dl className="mt-3 space-y-2 text-xs">
                    {(
                      [
                        ['Added', section.added],
                        ['Changed', section.changed],
                        ['Removed', section.removed],
                        ['Unchanged', section.unchanged],
                      ] as const
                    ).map(([label, items]) => (
                      <div key={label}>
                        <dt className="font-semibold text-zinc-600 dark:text-zinc-300">
                          {label} ({items.length})
                        </dt>
                        <dd className="text-zinc-500 dark:text-zinc-400">
                          {items.length === 0 ? '—' : items.map((item) => item.name).join(', ')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          {result}
        </p>
      )}
    </div>
  );
}
