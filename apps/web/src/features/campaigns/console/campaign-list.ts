/**
 * Campaign list filtering, saved views and bulk actions (#2258).
 */

export interface CampaignListItem {
  id: string;
  name: string;
  state: string;
  owner: string;
  tags: readonly string[];
  updatedAt: string;
}

export interface CampaignFilter {
  query: string;
  states: readonly string[];
  owners: readonly string[];
  tags: readonly string[];
  sort: 'updatedAt' | 'name' | 'state';
  direction: 'asc' | 'desc';
}

export const DEFAULT_FILTER: CampaignFilter = {
  query: '',
  states: [],
  owners: [],
  tags: [],
  sort: 'updatedAt',
  direction: 'desc',
};

export interface SavedView {
  id: string;
  name: string;
  filter: CampaignFilter;
}

export function filterCampaigns(items: readonly CampaignListItem[], filter: CampaignFilter): CampaignListItem[] {
  const query = filter.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query) && !item.id.toLowerCase().includes(query)) return false;
    if (filter.states.length > 0 && !filter.states.includes(item.state)) return false;
    if (filter.owners.length > 0 && !filter.owners.includes(item.owner)) return false;
    if (filter.tags.length > 0 && !filter.tags.every((tag) => item.tags.includes(tag))) return false;
    return true;
  });
  const multiplier = filter.direction === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const left = a[filter.sort];
    const right = b[filter.sort];
    return left.localeCompare(right) * multiplier || a.id.localeCompare(b.id);
  });
}

export function toggleBulkSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
}

export function selectVisible(selected: readonly string[], visible: readonly CampaignListItem[]): string[] {
  const visibleIds = new Set(visible.map((item) => item.id));
  const kept = selected.filter((id) => !visibleIds.has(id));
  const allVisibleSelected = visible.every((item) => selected.includes(item.id));
  return allVisibleSelected ? kept : [...kept, ...visibleIds];
}

export function serializeFilter(filter: CampaignFilter): string {
  const params = new URLSearchParams();
  if (filter.query) params.set('q', filter.query);
  if (filter.states.length) params.set('state', filter.states.join(','));
  if (filter.owners.length) params.set('owner', filter.owners.join(','));
  if (filter.tags.length) params.set('tag', filter.tags.join(','));
  if (filter.sort !== DEFAULT_FILTER.sort) params.set('sort', filter.sort);
  if (filter.direction !== DEFAULT_FILTER.direction) params.set('dir', filter.direction);
  return params.toString();
}

export function parseFilter(params: URLSearchParams): CampaignFilter {
  const sort = params.get('sort');
  return {
    query: (params.get('q') ?? '').slice(0, 256),
    states: (params.get('state') ?? '').split(',').filter(Boolean),
    owners: (params.get('owner') ?? '').split(',').filter(Boolean),
    tags: (params.get('tag') ?? '').split(',').filter(Boolean),
    sort: sort === 'name' || sort === 'state' ? sort : 'updatedAt',
    direction: params.get('dir') === 'asc' ? 'asc' : 'desc',
  };
}

export function matchSavedView(items: readonly CampaignListItem[], view: SavedView): CampaignListItem[] {
  return filterCampaigns(items, view.filter);
}
