/**
 * Feature-owned static command palette entries: navigation + actions.
 * Registered from feature code (see CommandPalette.tsx) — a second
 * demonstration (alongside `command-palette-runs-provider.ts`) that the
 * registry is extensible without editing `src/lib/command-palette/registry.ts`.
 */
import type { CommandEntry } from '../lib/command-palette/registry';
import { clearRecents } from '../lib/command-palette/recents';

export interface StaticEntryDeps {
  navigate: (path: string) => void;
  toggleTheme: () => void;
  toggleMaintainerMode: () => void;
  exportCurrentView: () => void;
  onRecentsCleared: () => void;
}

export function buildStaticEntries(deps: StaticEntryDeps): CommandEntry[] {
  const navigation: CommandEntry[] = [
    {
      id: 'nav:dashboard',
      title: 'Go to Dashboard',
      category: 'navigation',
      route: '/',
      run: () => deps.navigate('/'),
    },
    {
      id: 'nav:runs',
      title: 'Go to Runs',
      category: 'navigation',
      route: '/runs',
      run: () => deps.navigate('/runs'),
    },
    {
      id: 'nav:analytics',
      title: 'Go to Analytics',
      category: 'navigation',
      route: '/analytics',
      run: () => deps.navigate('/analytics'),
    },
    {
      id: 'nav:triage',
      title: 'Go to Triage',
      category: 'navigation',
      route: '/triage',
      run: () => deps.navigate('/triage'),
    },
    {
      id: 'nav:logs',
      title: 'Go to Logs',
      category: 'navigation',
      route: '/logs',
      run: () => deps.navigate('/logs'),
    },
    {
      id: 'nav:notification-center',
      title: 'Go to Notification Center',
      category: 'navigation',
      route: '/notification-center',
      run: () => deps.navigate('/notification-center'),
    },
    {
      id: 'nav:notification-preferences',
      title: 'Go to Notification Preferences',
      category: 'navigation',
      route: '/settings/notifications',
      keywords: ['settings', 'digest', 'quiet hours'],
      run: () => deps.navigate('/settings/notifications'),
    },
    {
      id: 'nav:settings-api',
      title: 'Go to API Settings',
      category: 'navigation',
      route: '/settings/api',
      run: () => deps.navigate('/settings/api'),
    },
    {
      id: 'nav:settings',
      title: 'Go to Settings',
      category: 'navigation',
      route: '/settings',
      run: () => deps.navigate('/settings'),
    },
  ];

  const actions: CommandEntry[] = [
    { id: 'action:toggle-theme', title: 'Toggle light / dark theme', category: 'action', run: deps.toggleTheme },
    {
      id: 'action:toggle-maintainer-mode',
      title: 'Toggle maintainer mode',
      category: 'action',
      run: deps.toggleMaintainerMode,
    },
    {
      id: 'action:export-current-view',
      title: 'Export current view',
      category: 'action',
      keywords: ['print', 'pdf', 'download'],
      run: deps.exportCurrentView,
    },
    {
      id: 'action:clear-recent-commands',
      title: 'Clear recent commands',
      category: 'action',
      keywords: ['palette', 'history'],
      run: () => {
        clearRecents();
        deps.onRecentsCleared();
      },
    },
  ];

  return [...navigation, ...actions];
}
