export interface CollaboratorPresence {
  userId: string;
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
}

export type SyncStatus = 'connected' | 'offline_draft' | 'reconciling';

export function getInitialPresence(): CollaboratorPresence[] {
  return [
    { userId: 'u-1', name: '@alice', color: '#10b981', cursorX: 180, cursorY: 120 },
    { userId: 'u-2', name: '@bob', color: '#f59e0b', cursorX: 420, cursorY: 210 },
  ];
}
