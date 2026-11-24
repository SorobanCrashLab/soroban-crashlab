'use client';

/**
 * Query canvas (#2339): visual blocks for source, joins, filters, time
 * window, columns, group-by, aggregations, sort/limit and parameters.
 *
 * Every block is a plain form control, so the whole query can be composed
 * with the keyboard. Drag-and-drop from the schema browser is an
 * enhancement: dropping a field on a section does exactly what that
 * section's "add" control does.
 */

import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { FIELD_DRAG_TYPE } from './SchemaBrowser';
import type { VisualQueryState } from './hooks/useVisualQuery';
import {
  AGGREGATIONS,
  AGGREGATION_TYPES,
  ENTITIES,
  ENTITY_NAMES,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  findRelation,
  getField,
  type AggregationFn,
  type Literal,
  type OperatorId,
} from './lib/schema';
import {
  defaultValueFor,
  entitiesInQuery,
  isAggregateQuery,
  isParamRef,
  type ConditionValue,
  type FilterCondition,
  type FilterGroup,
  type TimePreset,
} from './lib/model';
import type { ValidationIssue } from './lib/validate';

const PRESETS: Array<{ id: TimePreset; label: string }> = [
  { id: 'all', label: 'All time' },
  { id: 'last_1h', label: 'Last hour' },
  { id: 'last_24h', label: 'Last 24 hours' },
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
];

function allFields(entities: readonly string[]): string[] {
  return entities.flatMap((entity) =>
    ENTITIES[entity as keyof typeof ENTITIES].fields.map((field) => `${entity}.${field.name}`),
  );
}

function toLocalInput(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScalar(type: string, raw: string): Literal {
  if (type === 'number') {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (type === 'boolean') return raw === 'true';
  return raw;
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 text-xs" role="list">
      {issues.map((issue, index) => (
        <li key={index} className="field-error">
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  description,
  children,
  onDropField,
  dropLabel,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onDropField?: (ref: string) => void;
  dropLabel?: string;
}) {
  const [over, setOver] = useState(false);
  const headingId = useId();
  const accept = (event: DragEvent) => {
    if (!onDropField) return;
    if (event.dataTransfer.types.includes(FIELD_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setOver(true);
    }
  };
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded border px-3 py-2 ${over ? 'border-blue-500' : 'border-token'}`}
      onDragOver={accept}
      onDragEnter={accept}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const ref = event.dataTransfer.getData(FIELD_DRAG_TYPE);
        if (ref && onDropField) {
          event.preventDefault();
          onDropField(ref);
        }
      }}
    >
      <h3 id={headingId} className="text-sm-semibold flex-between">
        <span>{title}</span>
        {onDropField ? <span className="text-meta font-normal">{dropLabel ?? 'Drop a field here'}</span> : null}
      </h3>
      {description ? <p className="text-meta">{description}</p> : null}
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function FieldSelect({
  value,
  fields,
  onChange,
  label,
  placeholder = 'Choose a field…',
}: {
  value: string;
  fields: readonly string[];
  onChange: (ref: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <select className="input-field" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {fields.map((ref) => (
        <option key={ref} value={ref}>
          {ref}
        </option>
      ))}
    </select>
  );
}

function ValueEditor({
  condition,
  params,
  onChange,
}: {
  condition: FilterCondition;
  params: readonly string[];
  onChange: (value: ConditionValue) => void;
}) {
  const field = getField(condition.field);
  if (!field || condition.op === 'is_null' || condition.op === 'not_null') return null;
  const label = `Value for ${condition.field}`;

  if (isParamRef(condition.value)) {
    return (
      <select
        className="input-field"
        aria-label={`Parameter for ${condition.field}`}
        value={condition.value.param}
        onChange={(event) => onChange({ param: event.target.value })}
      >
        {params.map((name) => (
          <option key={name} value={name}>
            :{name}
          </option>
        ))}
      </select>
    );
  }

  const scalarInput = (value: Literal | undefined, onValue: (next: Literal) => void, ariaLabel: string) => {
    if (field.type === 'timestamp') {
      return (
        <input
          type="datetime-local"
          className="input-field"
          aria-label={`${ariaLabel} (UTC)`}
          value={toLocalInput(typeof value === 'number' ? value : null)}
          onChange={(event) => onValue(fromLocalInput(event.target.value) ?? 0)}
        />
      );
    }
    if (field.type === 'enum' && field.enumValues) {
      return (
        <select className="input-field" aria-label={ariaLabel} value={String(value ?? '')} onChange={(event) => onValue(event.target.value)}>
          {field.enumValues.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === 'boolean') {
      return (
        <select className="input-field" aria-label={ariaLabel} value={String(value)} onChange={(event) => onValue(event.target.value === 'true')}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    return (
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        className="input-field"
        aria-label={ariaLabel}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => onValue(parseScalar(field.type, event.target.value))}
      />
    );
  };

  if (condition.op === 'between') {
    const [low, high] = Array.isArray(condition.value) ? condition.value : [undefined, undefined];
    return (
      <span className="flex gap-1 items-center">
        {scalarInput(low, (next) => onChange([next, high ?? next]), `${label} lower bound`)}
        <span className="text-meta">and</span>
        {scalarInput(high, (next) => onChange([low ?? next, next]), `${label} upper bound`)}
      </span>
    );
  }

  if (condition.op === 'in' || condition.op === 'not_in') {
    const values = Array.isArray(condition.value) ? condition.value : [];
    if (field.enumValues) {
      return (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{label}</legend>
          {field.enumValues.map((option) => (
            <label key={option} className="text-sm flex items-center gap-1">
              <input
                type="checkbox"
                checked={values.includes(option)}
                onChange={(event) =>
                  onChange(event.target.checked ? [...values, option] : values.filter((value) => value !== option))
                }
              />
              {option}
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <input
        type="text"
        className="input-field"
        aria-label={`${label} (comma-separated)`}
        value={values.join(', ')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part) => parseScalar(field.type, part)),
          )
        }
      />
    );
  }

  return scalarInput(Array.isArray(condition.value) ? undefined : (condition.value as Literal), onChange, label);
}

function FilterGroupEditor({
  group,
  state,
  fields,
  issuesFor,
  depth,
}: {
  group: FilterGroup;
  state: VisualQueryState;
  fields: readonly string[];
  issuesFor: (blockId: string) => ValidationIssue[];
  depth: number;
}) {
  const [pending, setPending] = useState('');
  const params = state.query.params.map((param) => param.name);
  return (
    <div className={depth > 0 ? 'border-l-2 border-token pl-3' : ''} role="group" aria-label={depth === 0 ? 'Filter conditions' : 'Nested filter group'}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm flex items-center gap-1">
          Match
          <select
            className="input-field"
            value={group.combinator}
            onChange={(event) =>
              state.updateNode(group.id, (node) =>
                node.kind === 'group' ? { ...node, combinator: event.target.value as 'and' | 'or' } : node,
              )
            }
          >
            <option value="and">all (AND)</option>
            <option value="or">any (OR)</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-1">
          <input
            type="checkbox"
            checked={group.negate}
            onChange={(event) =>
              state.updateNode(group.id, (node) => (node.kind === 'group' ? { ...node, negate: event.target.checked } : node))
            }
          />
          NOT
        </label>
        {depth > 0 ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => state.removeNode(group.id)}>
            Remove group
          </button>
        ) : null}
      </div>
      <IssueList issues={issuesFor(group.id)} />

      <ul className="mt-2 flex flex-col gap-2">
        {group.children.map((child) =>
          child.kind === 'group' ? (
            <li key={child.id}>
              <FilterGroupEditor group={child} state={state} fields={fields} issuesFor={issuesFor} depth={depth + 1} />
            </li>
          ) : (
            <li key={child.id} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <FieldSelect
                  value={child.field}
                  fields={fields}
                  label="Condition field"
                  onChange={(ref) => {
                    const field = getField(ref);
                    if (!field) return;
                    const op = OPERATORS_BY_TYPE[field.type].includes(child.op) ? child.op : OPERATORS_BY_TYPE[field.type][0];
                    state.updateNode(child.id, () => ({ ...child, field: ref, op, value: defaultValueFor(field.type, op, field.enumValues) }));
                  }}
                />
                <select
                  className="input-field"
                  aria-label={`Operator for ${child.field}`}
                  value={child.op}
                  onChange={(event) => {
                    const op = event.target.value as OperatorId;
                    const field = getField(child.field);
                    state.updateNode(child.id, () => ({
                      ...child,
                      op,
                      value: isParamRef(child.value) ? child.value : defaultValueFor(field?.type ?? 'string', op, field?.enumValues),
                    }));
                  }}
                >
                  {(getField(child.field) ? OPERATORS_BY_TYPE[getField(child.field)!.type] : []).map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>
                <ValueEditor
                  condition={child}
                  params={params}
                  onChange={(value) => state.updateNode(child.id, () => ({ ...child, value }))}
                />
                {params.length > 0 && child.op !== 'is_null' && child.op !== 'not_null' ? (
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isParamRef(child.value)}
                      onChange={(event) => {
                        const field = getField(child.field);
                        state.updateNode(child.id, () => ({
                          ...child,
                          value: event.target.checked
                            ? { param: params[0] }
                            : defaultValueFor(field?.type ?? 'string', child.op, field?.enumValues),
                        }));
                      }}
                    />
                    param
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  aria-label={`Remove condition on ${child.field}`}
                  onClick={() => state.removeNode(child.id)}
                >
                  ✕
                </button>
              </div>
              <IssueList issues={issuesFor(child.id)} />
            </li>
          ),
        )}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FieldSelect value={pending} fields={fields} label="Field for new condition" onChange={setPending} />
        <button
          type="button"
          className="btn-outline text-xs"
          disabled={!pending}
          onClick={() => {
            state.addCondition(group.id, pending);
            setPending('');
          }}
        >
          Add condition
        </button>
        {depth < 3 ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => state.addGroup(group.id)}>
            Add group
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MoveButtons({ label, onMove }: { label: string; onMove: (delta: -1 | 1) => void }) {
  return (
    <>
      <button type="button" className="btn-ghost text-xs" aria-label={`Move ${label} up`} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="btn-ghost text-xs" aria-label={`Move ${label} down`} onClick={() => onMove(1)}>
        ↓
      </button>
    </>
  );
}

export function QueryCanvas({ state }: { state: VisualQueryState }) {
  const { query, validation } = state;
  const present = entitiesInQuery(query);
  const fields = allFields(present);
  const [aggFn, setAggFn] = useState<AggregationFn>('count');
  const [aggField, setAggField] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [paramName, setParamName] = useState('');
  const [paramType, setParamType] = useState<'string' | 'number' | 'boolean' | 'timestamp'>('string');
  const issues = [...validation.errors, ...validation.warnings];
  const issuesFor = (blockId: string) => issues.filter((issue) => issue.blockId === blockId);
  const issuesAt = (prefix: string) => issues.filter((issue) => !issue.blockId && issue.path.startsWith(prefix));
  const aggregate = isAggregateQuery(query);
  const sortKeys = aggregate ? [...query.groupBy, ...query.aggregations.map((agg) => agg.alias)] : fields;
  const aggFields = fields.filter((ref) => {
    const field = getField(ref);
    return field ? AGGREGATION_TYPES[aggFn].includes(field.type) : false;
  });

  return (
    <div className="card card-padding flex flex-col gap-3 min-w-0" aria-label="Query canvas">
      <Section title="Source" description="The entity every row starts from.">
        <label className="text-sm flex items-center gap-2">
          From
          <select
            className="input-field"
            value={query.source}
            onChange={(event) => state.setSource(event.target.value as (typeof ENTITY_NAMES)[number])}
          >
            {ENTITY_NAMES.map((entity) => (
              <option key={entity} value={entity}>
                {ENTITIES[entity].label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Relations" description="Join related entities along declared relations.">
        {query.joins.length === 0 ? <p className="text-meta">No joins. Use “Join” in the schema browser.</p> : null}
        {query.joins.map((join) => {
          const relation = findRelation(join.relation);
          return (
            <div key={join.id}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input-field"
                  aria-label={`Join type for ${join.entity}`}
                  value={join.kind}
                  onChange={(event) => state.updateJoinKind(join.id, event.target.value as 'inner' | 'left')}
                >
                  <option value="inner">inner join</option>
                  <option value="left">left join (keep unmatched)</option>
                </select>
                <span className="text-sm">
                  <strong>{ENTITIES[join.entity].label}</strong>{' '}
                  <span className="text-meta">{relation?.description}</span>
                </span>
                <button type="button" className="btn-ghost text-xs" onClick={() => state.removeJoin(join.id)} aria-label={`Remove join ${join.entity}`}>
                  ✕
                </button>
              </div>
              <IssueList issues={issuesFor(join.id)} />
            </div>
          );
        })}
        <IssueList issues={issuesAt('joins')} />
      </Section>

      <Section
        title="Filters"
        onDropField={(ref) => state.addCondition('root', ref)}
        dropLabel="Drop a field to filter"
      >
        <FilterGroupEditor group={query.filters} state={state} fields={fields} issuesFor={issuesFor} depth={0} />
      </Section>

      <Section title="Time window">
        <div className="flex flex-wrap items-center gap-2">
          <FieldSelect
            value={query.timeWindow?.field ?? ''}
            fields={state.timestampFields}
            label="Time field"
            placeholder="No time window"
            onChange={(ref) =>
              state.setTimeWindow(ref ? { field: ref, preset: query.timeWindow?.preset ?? 'last_7d', from: null, to: null } : null)
            }
          />
          {query.timeWindow ? (
            <select
              className="input-field"
              aria-label="Time window preset"
              value={query.timeWindow.preset}
              onChange={(event) => state.setTimeWindow({ ...query.timeWindow!, preset: event.target.value as TimePreset })}
            >
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          ) : null}
          {query.timeWindow?.preset === 'custom' ? (
            <>
              <input
                type="datetime-local"
                className="input-field"
                aria-label="Window start (UTC)"
                value={toLocalInput(query.timeWindow.from)}
                onChange={(event) => state.setTimeWindow({ ...query.timeWindow!, from: fromLocalInput(event.target.value) })}
              />
              <input
                type="datetime-local"
                className="input-field"
                aria-label="Window end (UTC)"
                value={toLocalInput(query.timeWindow.to)}
                onChange={(event) => state.setTimeWindow({ ...query.timeWindow!, to: fromLocalInput(event.target.value) })}
              />
            </>
          ) : null}
        </div>
        <p className="text-meta">Relative windows end at the newest value in the data.</p>
        <IssueList issues={issuesAt('timeWindow')} />
      </Section>

      {!aggregate ? (
        <Section title="Columns" onDropField={state.toggleSelect} dropLabel="Drop a field to show it">
          {query.select.length === 0 ? <p className="text-meta">Default columns for each entity.</p> : null}
          <ul className="flex flex-wrap gap-2">
            {query.select.map((ref) => (
              <li key={ref} className="chip">
                {ref}
                <MoveButtons label={ref} onMove={(delta) => state.moveSelect(ref, delta)} />
                <button type="button" className="btn-ghost text-xs" aria-label={`Hide ${ref}`} onClick={() => state.toggleSelect(ref)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <IssueList issues={issuesAt('select')} />
        </Section>
      ) : null}

      <Section title="Group by" onDropField={state.toggleGroupBy} dropLabel="Drop a field to group">
        {query.groupBy.length === 0 ? <p className="text-meta">Not grouped.</p> : null}
        <ul className="flex flex-wrap gap-2">
          {query.groupBy.map((ref) => (
            <li key={ref} className="chip">
              {ref}
              <button type="button" className="btn-ghost text-xs" aria-label={`Stop grouping by ${ref}`} onClick={() => state.toggleGroupBy(ref)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <IssueList issues={issuesAt('groupBy')} />
      </Section>

      <Section title="Aggregations">
        {query.aggregations.map((agg) => (
          <div key={agg.id}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-sm">
                {agg.fn}({agg.field ?? '*'})
              </code>
              <label className="text-sm flex items-center gap-1">
                as
                <input
                  className="input-field"
                  value={agg.alias}
                  aria-label={`Alias for ${agg.fn}(${agg.field ?? '*'})`}
                  onChange={(event) => state.updateAggregation(agg.id, { alias: event.target.value.replace(/[^a-z0-9_]/gi, '_') })}
                />
              </label>
              <MoveButtons label={agg.alias} onMove={(delta) => state.moveAggregation(agg.id, delta)} />
              <button type="button" className="btn-ghost text-xs" aria-label={`Remove ${agg.alias}`} onClick={() => state.removeAggregation(agg.id)}>
                ✕
              </button>
            </div>
            <IssueList issues={issuesFor(agg.id)} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-field" aria-label="Aggregation function" value={aggFn} onChange={(event) => setAggFn(event.target.value as AggregationFn)}>
            {AGGREGATIONS.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
          <FieldSelect
            value={aggField}
            fields={aggFields}
            label="Aggregation field"
            placeholder={aggFn === 'count' ? '* (all rows)' : 'Choose a field…'}
            onChange={setAggField}
          />
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={aggFn !== 'count' && !aggField}
            onClick={() => {
              state.addAggregation(aggFn, aggField || null);
              setAggField('');
            }}
          >
            Add aggregation
          </button>
        </div>
      </Section>

      <Section title="Sort & limit">
        {query.sort.map((sort) => (
          <div key={sort.id}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-sm">{sort.key}</code>
              <select
                className="input-field"
                aria-label={`Direction for ${sort.key}`}
                value={sort.direction}
                onChange={(event) => state.updateSort(sort.id, { direction: event.target.value as 'asc' | 'desc' })}
              >
                <option value="desc">descending</option>
                <option value="asc">ascending</option>
              </select>
              <MoveButtons label={sort.key} onMove={(delta) => state.moveSort(sort.id, delta)} />
              <button type="button" className="btn-ghost text-xs" aria-label={`Remove sort on ${sort.key}`} onClick={() => state.removeSort(sort.id)}>
                ✕
              </button>
            </div>
            <IssueList issues={issuesFor(sort.id)} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <FieldSelect value={sortKey} fields={sortKeys} label="Sort key" placeholder="Sort by…" onChange={setSortKey} />
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={!sortKey}
            onClick={() => {
              state.addSort(sortKey);
              setSortKey('');
            }}
          >
            Add sort
          </button>
          <label className="text-sm flex items-center gap-1">
            Limit
            <input
              type="number"
              min={1}
              max={1000}
              className="input-field w-24"
              value={query.limit}
              onChange={(event) => state.setLimit(Number(event.target.value))}
            />
          </label>
        </div>
        <IssueList issues={issuesAt('limit')} />
      </Section>

      <Section title="Parameters" description="Named values bound at run time, so a saved query can be reused.">
        {query.params.map((param) => (
          <div key={param.name} className="flex flex-wrap items-center gap-2">
            <code className="text-sm">:{param.name}</code>
            <span className="ds-badge ds-badge-neutral">{param.type}</span>
            <button type="button" className="btn-ghost text-xs" aria-label={`Remove parameter ${param.name}`} onClick={() => state.removeParam(param.name)}>
              ✕
            </button>
          </div>
        ))}
        <IssueList issues={issuesAt('params')} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input-field"
            aria-label="New parameter name"
            placeholder="name"
            value={paramName}
            onChange={(event) => setParamName(event.target.value.replace(/[^a-z0-9_]/gi, '').slice(0, 40))}
          />
          <select className="input-field" aria-label="New parameter type" value={paramType} onChange={(event) => setParamType(event.target.value as typeof paramType)}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="timestamp">timestamp</option>
          </select>
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={!/^[a-z]/i.test(paramName)}
            onClick={() => {
              state.addParam({ name: paramName, type: paramType, defaultValue: null, description: '' });
              setParamName('');
            }}
          >
            Add parameter
          </button>
        </div>
      </Section>
    </div>
  );
}
