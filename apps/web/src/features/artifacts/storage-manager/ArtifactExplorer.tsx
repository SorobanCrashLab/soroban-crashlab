'use client';

/**
 * Multi-backend artifact explorer (#2342): backend health, server-side
 * filters, paginated results with integrity badges, and audited bulk actions.
 */

import { useState } from 'react';
import { downloadTextFile } from '@/app/utils/browser-download';
import { formatSize } from '@/app/utils/format';
import { metadataCsv } from './lib/governance';
import { ARTIFACT_TYPES, STORAGE_BACKENDS } from './lib/model';
import type { ArtifactManagerState } from './hooks/useArtifactManager';

export function TrustBadge({ level }: { level: 'trusted' | 'warning' | 'blocked' }) {
  const tone = level === 'trusted' ? 'ds-badge-success' : level === 'warning' ? 'ds-badge-warning' : 'ds-badge-error';
  const label = level === 'trusted' ? '✓ trusted' : level === 'warning' ? '! warning' : '✕ blocked';
  return <span className={`ds-badge ${tone}`}>{label}</span>;
}

function HealthBadge({ health }: { health: 'ok' | 'degraded' | 'unavailable' }) {
  const tone = health === 'ok' ? 'ds-badge-success' : health === 'degraded' ? 'ds-badge-warning' : 'ds-badge-neutral';
  return <span className={`ds-badge ${tone}`}>{health}</span>;
}

export function ArtifactExplorer({ state }: { state: ArtifactManagerState }) {
  const { browse, filters, viewer } = state;
  const [tagInput, setTagInput] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const items = browse.data?.items ?? [];
  const pageIds = items.map((item) => item.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => state.selection.includes(id));
  const selectedItems = items.filter((item) => state.selection.includes(item.id));

  const field = (key: keyof typeof filters, label: string, type: 'text' | 'number' | 'datetime-local' = 'text') => (
    <label className="text-sm flex flex-col gap-1">
      <span className="input-label">{label}</span>
      <input
        className="input-field"
        type={type}
        value={(filters[key] as string | undefined) ?? ''}
        onChange={(event) => state.updateFilters({ [key]: event.target.value || undefined })}
      />
    </label>
  );

  const select = (key: keyof typeof filters, label: string, options: readonly string[]) => (
    <label className="text-sm flex flex-col gap-1">
      <span className="input-label">{label}</span>
      <select
        className="input-field"
        value={(filters[key] as string | undefined) ?? ''}
        onChange={(event) => state.updateFilters({ [key]: event.target.value || undefined })}
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {key === 'backend' && browse.data?.facets.backend[option] !== undefined ? ` (${browse.data.facets.backend[option]})` : ''}
            {key === 'type' && browse.data?.facets.type[option] !== undefined ? ` (${browse.data.facets.type[option]})` : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <section aria-label="Storage backends" className="grid gap-2 sm:grid-cols-3">
        {(browse.data?.backends ?? []).map((backend) => (
          <article key={backend.backend} className="card card-padding">
            <div className="flex-between">
              <h3 className="text-sm-semibold">{backend.label}</h3>
              <HealthBadge health={backend.health} />
            </div>
            <p className="text-meta">
              {backend.artifactCount} artifacts · {formatSize(backend.bytes)}
            </p>
            <p className="text-meta text-xs">{backend.detail}</p>
          </article>
        ))}
      </section>

      <form
        className="card card-padding grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Artifact filters"
        onSubmit={(event) => event.preventDefault()}
      >
        {field('q', 'Search name or id')}
        {select('backend', 'Backend', STORAGE_BACKENDS)}
        {select('type', 'Type', ARTIFACT_TYPES)}
        {select('integrity', 'Integrity', ['trusted', 'warning', 'blocked'])}
        {field('campaign', 'Campaign')}
        {field('run', 'Run')}
        {field('tag', 'Tag')}
        {select('sensitivity', 'Sensitivity', ['public', 'internal', 'restricted'])}
        {field('from', 'Created after (UTC)', 'datetime-local')}
        {field('to', 'Created before (UTC)', 'datetime-local')}
        {field('minSize', 'Min size (bytes)', 'number')}
        {field('maxSize', 'Max size (bytes)', 'number')}
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Sort</span>
          <select
            className="input-field"
            value={`${filters.sort}:${filters.dir}`}
            onChange={(event) => {
              const [sort, dir] = event.target.value.split(':') as [typeof filters.sort, typeof filters.dir];
              state.updateFilters({ sort, dir });
            }}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="sizeBytes:desc">Largest first</option>
            <option value="name:asc">Name A–Z</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" className="btn-ghost text-xs" onClick={state.resetFilters}>
            Reset filters
          </button>
        </div>
      </form>

      {state.selection.length > 0 ? (
        <section className="card card-padding flex flex-wrap items-end gap-2" aria-label="Bulk actions">
          <p className="text-sm-medium w-full">{state.selection.length} selected</p>
          {viewer?.permissions.tag ? (
            <>
              <input className="input-field" aria-label="Tag to add" placeholder="tag" value={tagInput} onChange={(event) => setTagInput(event.target.value)} />
              <button
                type="button"
                className="btn-outline text-xs"
                disabled={!tagInput.trim() || state.busy}
                onClick={() => {
                  void state.tag(state.selection, [tagInput]);
                  setTagInput('');
                }}
              >
                Add tag
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={selectedItems.length === 0}
            onClick={() => downloadTextFile(metadataCsv(selectedItems), 'artifact-metadata.csv', 'text/csv')}
          >
            Export metadata (CSV)
          </button>
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={selectedItems.length === 0}
            onClick={() => downloadTextFile(JSON.stringify(selectedItems, null, 2), 'artifact-metadata.json')}
          >
            Export metadata (JSON)
          </button>
          {viewer?.permissions.requestDeletion ? (
            <>
              <input
                className="input-field"
                aria-label="Deletion reason"
                placeholder="Reason for deletion"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
              />
              <button
                type="button"
                className="btn-danger text-xs"
                disabled={deleteReason.trim().length < 5 || state.busy}
                onClick={() => {
                  void state.requestDeletion(state.selection, deleteReason);
                  setDeleteReason('');
                  state.clearSelection();
                }}
              >
                Request deletion
              </button>
            </>
          ) : null}
          <button type="button" className="btn-ghost text-xs" onClick={state.clearSelection}>
            Clear selection
          </button>
          <p className="text-meta text-xs w-full">
            Deletion requests need approval from a different maintainer; artifacts under hold are skipped.
          </p>
        </section>
      ) : null}

      <section className="card card-padding min-w-0" aria-label="Artifacts" aria-busy={browse.loading}>
        <div className="flex-between mb-2">
          <h2 className="text-sm-semibold">Artifacts</h2>
          <p className="text-meta" role="status" aria-live="polite">
            {browse.loading ? 'Loading…' : `${browse.data?.total ?? 0} matching · page ${state.page}`}
          </p>
        </div>
        {browse.error ? (
          <p className="field-error text-sm" role="alert">
            {browse.error}
          </p>
        ) : null}
        <div className="table-responsive overflow-auto">
          <table className="data-table text-sm">
            <caption className="sr-only">Artifacts matching the current filters</caption>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allSelected}
                    onChange={(event) => state.selectPage(pageIds, event.target.checked)}
                  />
                </th>
                <th scope="col" className="text-left">Name</th>
                <th scope="col" className="text-left">Backend</th>
                <th scope="col" className="text-left">Type</th>
                <th scope="col" className="text-left">Run</th>
                <th scope="col" className="text-right">Size</th>
                <th scope="col" className="text-left">Created</th>
                <th scope="col" className="text-left">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} aria-selected={state.selectedId === item.id} className={state.selectedId === item.id ? 'surface-soft' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={state.selection.includes(item.id)}
                      onChange={() => state.toggleSelected(item.id)}
                    />
                  </td>
                  <td className="max-w-[18rem] truncate">
                    <button type="button" className="link text-left" onClick={() => state.select(item.id)}>
                      {item.name}
                    </button>
                    {item.source === 'demo' ? <span className="ds-badge ds-badge-neutral ml-1">demo</span> : null}
                    {item.sensitivity === 'restricted' ? <span className="ds-badge ds-badge-warning ml-1">restricted</span> : null}
                  </td>
                  <td>{item.backend}</td>
                  <td>{item.type}</td>
                  <td>{item.runId ?? '—'}</td>
                  <td className="text-right whitespace-nowrap">{formatSize(item.sizeBytes)}</td>
                  <td className="whitespace-nowrap">{item.createdAt.slice(0, 10)}</td>
                  <td>
                    <TrustBadge level={item.trust} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!browse.loading && items.length === 0 ? <p className="text-meta mt-2">No artifacts match these filters.</p> : null}
        <div className="flex gap-2 mt-2">
          <button type="button" className="btn-outline text-xs" disabled={state.page === 1} onClick={state.previousPage}>
            Previous
          </button>
          <button type="button" className="btn-outline text-xs" disabled={!browse.data?.nextCursor} onClick={state.nextPage}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
