import type { Metadata } from 'next';
import { VisualQueryBuilder } from '@/features/query-builder/VisualQueryBuilder';
import { decodeShareToken } from '@/features/query-builder/lib/serialize';
import { findTemplate } from '@/features/query-builder/lib/templates';

export const metadata: Metadata = {
  title: 'Analytics Explorer | Soroban CrashLab',
  description:
    'Visual, schema-aware query builder across runs, crashes, logs, traces, metrics and CI with explain plans, pivots, charts and shareable queries.',
};

export const dynamic = 'force-dynamic';

const VIEWS = ['grid', 'pivot', 'chart', 'timeline'] as const;
type View = (typeof VIEWS)[number];

interface ExplorePageProps {
  searchParams: Promise<{ q?: string; template?: string; embed?: string; view?: string }>;
}

/**
 * /analytics/explore (#2339). `?q=` carries a shared query definition,
 * `?template=` a starter template, and `?embed=1&view=chart` renders only the
 * result widget for dashboards and reports.
 */
export default async function AnalyticsExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  let loadError: string | null = null;
  let initialQuery = params.template ? findTemplate(params.template)?.query : undefined;
  if (params.q) {
    const decoded = decodeShareToken(params.q);
    if (decoded.ok) initialQuery = decoded.query;
    else loadError = `The shared query could not be loaded: ${decoded.errors.join('; ')}`;
  }
  initialQuery ??= findTemplate('failures-by-area')?.query;
  const view = VIEWS.includes(params.view as View) ? (params.view as View) : undefined;

  return (
    <VisualQueryBuilder
      initialQuery={initialQuery}
      embed={params.embed === '1' && Boolean(params.q)}
      initialView={view}
      loadError={loadError}
    />
  );
}
