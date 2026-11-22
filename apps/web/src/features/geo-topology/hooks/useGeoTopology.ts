"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyFilters, normalizeFrame, type MetricLayer, type TopologyFilters, type TopologyFrame } from '@/lib/topology/normalize';

export interface ExplorerState {
  layer: MetricLayer;
  frameIndex: number;
  filters: TopologyFilters;
  selectedId: string | null;
  view: 'map' | 'topology';
}

export const DEFAULT_EXPLORER_STATE: ExplorerState = { layer: 'crashRate', frameIndex: -1, filters: {}, selectedId: null, view: 'map' };

const LAYERS = ['runVolume', 'crashRate', 'latencyMs', 'budgetExhaustion', 'queueDepth'];

/** Share state is just query params so a link restores filters, layer, time and selection. */
export function encodeExplorerState(s: ExplorerState): string {
  const p = new URLSearchParams();
  if (s.layer !== DEFAULT_EXPLORER_STATE.layer) p.set('layer', s.layer);
  if (s.frameIndex >= 0) p.set('frame', String(s.frameIndex));
  if (s.view !== 'map') p.set('view', s.view);
  if (s.selectedId) p.set('node', s.selectedId);
  const f = s.filters;
  if (f.regions?.length) p.set('regions', f.regions.join(','));
  if (f.kinds?.length) p.set('kinds', f.kinds.join(','));
  if (f.health?.length) p.set('health', f.health.join(','));
  if (f.networks?.length) p.set('networks', f.networks.join(','));
  return p.toString();
}

export function decodeExplorerState(query: string): ExplorerState {
  const p = new URLSearchParams(query);
  const list = (k: string) => p.get(k)?.split(',').filter(Boolean);
  const layer = p.get('layer');
  const frame = Number(p.get('frame'));
  return {
    layer: layer && LAYERS.includes(layer) ? (layer as MetricLayer) : DEFAULT_EXPLORER_STATE.layer,
    frameIndex: Number.isInteger(frame) && p.has('frame') && frame >= 0 ? frame : -1,
    view: p.get('view') === 'topology' ? 'topology' : 'map',
    selectedId: p.get('node'),
    filters: {
      regions: list('regions'),
      kinds: list('kinds') as TopologyFilters['kinds'],
      health: list('health') as TopologyFilters['health'],
      networks: list('networks'),
    },
  };
}

export function useGeoTopology(identityRole: 'viewer' | 'responder' | 'maintainer' = 'viewer') {
  const [frames, setFrames] = useState<TopologyFrame[]>([]);
  const [privacy, setPrivacy] = useState<'strict' | 'standard'>('strict');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ExplorerState>(() =>
    typeof window === 'undefined' ? DEFAULT_EXPLORER_STATE : decodeExplorerState(window.location.search),
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/topology?frames=24&privacy=standard`, { headers: { 'x-crashlab-role': identityRole } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed to load topology (${r.status})`))))
      .then((data) => {
        if (cancelled) return;
        setFrames((data.frames as TopologyFrame[]).map((f) => normalizeFrame(f)));
        setPrivacy(data.privacy);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load topology'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [identityRole]);

  const update = useCallback((patch: Partial<ExplorerState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== 'undefined') {
        const q = encodeExplorerState(next);
        window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
      }
      return next;
    });
  }, []);

  const index = frames.length ? (state.frameIndex < 0 ? frames.length - 1 : Math.min(state.frameIndex, frames.length - 1)) : 0;
  const frame = frames[index];
  const filtered = useMemo(() => (frame ? applyFilters(frame, state.filters) : null), [frame, state.filters]);

  return { frames, frame: filtered, rawFrame: frame, index, privacy, loading, error, state, update };
}
