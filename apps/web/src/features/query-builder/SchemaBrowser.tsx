'use client';

/**
 * Schema browser (#2339): entities, field types, descriptions, sample values
 * and compatibility hints. Fields are draggable onto the canvas, and every
 * drag target has an equivalent button so composition never requires a
 * pointer.
 */

import { useId, useMemo, useState } from 'react';
import {
  AGGREGATION_TYPES,
  ENTITIES,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  joinableRelations,
  type EntityName,
  type FieldDefinition,
} from './lib/schema';
import type { DatasetStats } from './lib/explain';
import { canSeeRestricted, type ViewerRole } from './lib/validate';

export const FIELD_DRAG_TYPE = 'application/x-crashlab-field';

export interface SchemaBrowserProps {
  present: readonly EntityName[];
  stats: DatasetStats;
  role: ViewerRole;
  onAddFilter: (ref: string) => void;
  onToggleGroupBy: (ref: string) => void;
  onToggleSelect: (ref: string) => void;
  onAddJoin: (relationId: string) => void;
  selected: readonly string[];
  grouped: readonly string[];
}

function hintFor(field: FieldDefinition): string {
  const aggs = Object.entries(AGGREGATION_TYPES)
    .filter(([, types]) => types.includes(field.type))
    .map(([fn]) => fn);
  return `Operators: ${OPERATORS_BY_TYPE[field.type].map((op) => OPERATOR_LABELS[op]).join(', ')}. Aggregations: ${aggs.join(', ')}.`;
}

export function SchemaBrowser({
  present,
  stats,
  role,
  onAddFilter,
  onToggleGroupBy,
  onToggleSelect,
  onAddJoin,
  selected,
  grouped,
}: SchemaBrowserProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchId = useId();
  const term = search.trim().toLowerCase();
  const joinable = useMemo(() => joinableRelations(present), [present]);
  const canSee = canSeeRestricted(role);

  return (
    <aside className="card card-padding flex flex-col gap-3 min-w-0" aria-label="Schema browser">
      <div>
        <h2 className="text-sm-semibold">Schema</h2>
        <label htmlFor={searchId} className="sr-only">
          Search fields
        </label>
        <input
          id={searchId}
          type="search"
          className="input-field mt-2"
          placeholder="Search fields…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {present.map((entity) => {
        const definition = ENTITIES[entity];
        const fields = definition.fields.filter(
          (field) =>
            !term || field.name.includes(term) || field.description.toLowerCase().includes(term),
        );
        return (
          <section key={entity} aria-labelledby={`schema-${entity}`}>
            <h3 id={`schema-${entity}`} className="text-sm-medium flex-between">
              <span>{definition.label}</span>
              <span className="text-meta">{stats[entity] ? `${stats[entity]!.rows.toLocaleString('en-US')} rows` : ''}</span>
            </h3>
            <p className="text-meta">{definition.description}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {fields.map((field) => {
                const ref = `${entity}.${field.name}`;
                const isOpen = expanded === ref;
                const restricted = Boolean(field.restricted && !canSee);
                return (
                  <li
                    key={ref}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(FIELD_DRAG_TYPE, ref);
                      event.dataTransfer.setData('text/plain', ref);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="rounded border border-token px-2 py-1"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left flex-1 min-w-0 truncate text-sm"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : ref)}
                      >
                        <code>{field.name}</code>{' '}
                        <span className="ds-badge ds-badge-neutral">{field.type}</span>
                        {field.restricted ? (
                          <span className="ds-badge ds-badge-warning ml-1" title="Restricted field">
                            restricted
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={restricted}
                        onClick={() => onAddFilter(ref)}
                        aria-label={`Filter by ${ref}`}
                      >
                        +filter
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={restricted}
                        aria-pressed={grouped.includes(ref)}
                        onClick={() => onToggleGroupBy(ref)}
                        aria-label={`Group by ${ref}`}
                      >
                        group
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        aria-pressed={selected.includes(ref)}
                        onClick={() => onToggleSelect(ref)}
                        aria-label={`Show column ${ref}`}
                      >
                        col
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="text-meta mt-1">
                        <p>{field.description}{field.unit ? ` (${field.unit})` : ''}</p>
                        {field.enumValues ? <p>Values: {field.enumValues.join(', ')}</p> : null}
                        {field.samples ? <p>Samples: {field.samples.join(', ')}</p> : null}
                        <p>{hintFor(field)}</p>
                        {restricted ? <p>Visible to maintainers only; redacted in your results.</p> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {joinable.length > 0 ? (
        <section aria-labelledby="schema-relations">
          <h3 id="schema-relations" className="text-sm-medium">
            Related entities
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {joinable.map((relation) => (
              <li key={relation.id} className="flex-between gap-2">
                <span className="text-sm min-w-0">
                  {ENTITIES[relation.to].label}{' '}
                  <span className="text-meta">
                    {relation.from}.{relation.fromField} → {relation.to}.{relation.toField}
                  </span>
                </span>
                <button type="button" className="btn-outline text-xs" onClick={() => onAddJoin(relation.id)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
