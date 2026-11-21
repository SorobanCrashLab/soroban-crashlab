/**
 * Quarantine Hooks
 * 
 * React hooks for quarantine management UI.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { QuarantineManager, QuarantineEntry, QuarantineFilter, QuarantineStats, QuarantineStatus, QuarantineReason } from '../quarantine/QuarantineManager.js';

export interface UseQuarantineOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  defaultFilter?: QuarantineFilter;
}

export interface UseQuarantineReturn {
  // Data
  entries: QuarantineEntry[];
  stats: QuarantineStats;
  selectedEntry: QuarantineEntry | null;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  
  // Actions
  refresh: () => Promise<void>;
  selectEntry: (entry: QuarantineEntry | null) => void;
  startReview: (entryId: string, reviewerId: string, reviewerName: string) => Promise<void>;
  approve: (entryId: string, userId: string, userName: string, notes?: string) => Promise<void>;
  reject: (entryId: string, userId: string, userName: string, notes?: string) => Promise<void>;
  release: (entryId: string, releasePath?: string) => Promise<void>;
  delete: (entryId: string, deleteArtifact?: boolean) => Promise<void>;
  rescan: (entryId: string) => Promise<void>;
  downloadArtifact: (entryId: string) => Promise<Blob | null>;
  viewArtifact: (entryId: string) => Promise<string | null>; // base64
  
  // Filters
  filter: QuarantineFilter;
  setFilter: (filter: QuarantineFilter) => void;
  clearFilter: () => void;
  
  // Pagination
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  totalPages: number;
  
  // Bulk actions
  bulkApprove: (entryIds: string[], userId: string, userName: string) => Promise<void>;
  bulkReject: (entryIds: string[], userId: string, userName: string) => Promise<void>;
  bulkRelease: (entryIds: string[]) => Promise<void>;
  bulkDelete: (entryIds: string[]) => Promise<void>;
}

export function useQuarantine(
  quarantineManager: QuarantineManager,
  options: UseQuarantineOptions = {}
): UseQuarantineReturn {
  const [entries, setEntries] = useState<QuarantineEntry[]>([]);
  const [stats, setStats] = useState<QuarantineStats>({
    total: 0,
    pending: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    released: 0,
    deleted: 0,
    byReason: {
      malware: 0,
      suspicious: 0,
      unsigned: 0,
      'invalid-signature': 0,
      'policy-violation': 0,
      manual: 0,
    },
  });
  const [selectedEntry, setSelectedEntry] = useState<QuarantineEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<QuarantineFilter>(options.defaultFilter || {});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    
    try {
      const [newEntries, newStats] = await Promise.all([
        Promise.resolve(quarantineManager.getEntries({ ...filter, limit: pageSize, offset: (page - 1) * pageSize })),
        Promise.resolve(quarantineManager.getStats()),
      ]);
      
      setEntries(newEntries);
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh'));
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [quarantineManager, filter, page, pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (options.autoRefresh && options.refreshInterval) {
      const interval = setInterval(refresh, options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [options.autoRefresh, options.refreshInterval, refresh]);

  const selectEntry = useCallback((entry: QuarantineEntry | null) => {
    setSelectedEntry(entry);
  }, []);

  const startReview = useCallback(async (entryId: string, reviewerId: string, reviewerName: string) => {
    setError(null);
    try {
      const updated = await quarantineManager.startReview(entryId, reviewerId, reviewerName);
      if (updated) {
        setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
        if (selectedEntry?.id === entryId) setSelectedEntry(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start review'));
      throw err;
    }
  }, [quarantineManager, selectedEntry]);

  const approve = useCallback(async (entryId: string, userId: string, userName: string, notes?: string) => {
    setError(null);
    try {
      const updated = await quarantineManager.addApproval(entryId, userId, userName, 'approve', notes);
      if (updated) {
        setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
        if (selectedEntry?.id === entryId) setSelectedEntry(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to approve'));
      throw err;
    }
  }, [quarantineManager, selectedEntry]);

  const reject = useCallback(async (entryId: string, userId: string, userName: string, notes?: string) => {
    setError(null);
    try {
      const updated = await quarantineManager.addApproval(entryId, userId, userName, 'reject', notes);
      if (updated) {
        setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
        if (selectedEntry?.id === entryId) setSelectedEntry(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reject'));
      throw err;
    }
  }, [quarantineManager, selectedEntry]);

  const release = useCallback(async (entryId: string, releasePath?: string) => {
    setError(null);
    try {
      const result = await quarantineManager.releaseEntry(entryId, releasePath);
      if (!result.success) {
        throw new Error(result.error || 'Release failed');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to release'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  const deleteEntry = useCallback(async (entryId: string, deleteArtifact = true) => {
    setError(null);
    try {
      const success = await quarantineManager.deleteEntry(entryId, deleteArtifact);
      if (!success) {
        throw new Error('Delete failed');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  const rescan = useCallback(async (entryId: string) => {
    setError(null);
    try {
      // Would trigger a rescan - implementation depends on malware scanner integration
      console.log('Rescan requested for:', entryId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to rescan'));
      throw err;
    }
  }, []);

  const downloadArtifact = useCallback(async (entryId: string): Promise<Blob | null> => {
    setError(null);
    try {
      const buffer = await quarantineManager.getArtifactBuffer(entryId);
      if (!buffer) return null;
      return new Blob([buffer]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to download'));
      throw err;
    }
  }, [quarantineManager]);

  const viewArtifact = useCallback(async (entryId: string): Promise<string | null> => {
    setError(null);
    try {
      return await quarantineManager.getArtifactBase64(entryId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to view'));
      throw err;
    }
  }, [quarantineManager]);

  const clearFilter = useCallback(() => {
    setFilter({});
    setPage(1);
  }, []);

  const totalPages = Math.ceil(stats.total / pageSize);

  // Bulk actions
  const bulkApprove = useCallback(async (entryIds: string[], userId: string, userName: string) => {
    setError(null);
    try {
      await Promise.all(entryIds.map(id => quarantineManager.addApproval(id, userId, userName, 'approve')));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Bulk approve failed'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  const bulkReject = useCallback(async (entryIds: string[], userId: string, userName: string) => {
    setError(null);
    try {
      await Promise.all(entryIds.map(id => quarantineManager.addApproval(id, userId, userName, 'reject')));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Bulk reject failed'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  const bulkRelease = useCallback(async (entryIds: string[]) => {
    setError(null);
    try {
      await Promise.all(entryIds.map(id => quarantineManager.releaseEntry(id)));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Bulk release failed'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  const bulkDelete = useCallback(async (entryIds: string[]) => {
    setError(null);
    try {
      await Promise.all(entryIds.map(id => quarantineManager.deleteEntry(id)));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Bulk delete failed'));
      throw err;
    }
  }, [quarantineManager, refresh]);

  return {
    // Data
    entries,
    stats,
    selectedEntry,
    
    // Loading states
    isLoading,
    isRefreshing,
    error,
    
    // Actions
    refresh,
    selectEntry,
    startReview,
    approve,
    reject,
    release,
    delete: deleteEntry,
    rescan,
    downloadArtifact,
    viewArtifact,
    
    // Filters
    filter,
    setFilter,
    clearFilter,
    
    // Pagination
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    
    // Bulk actions
    bulkApprove,
    bulkReject,
    bulkRelease,
    bulkDelete,
  };
}

export const QUARANTINE_STATUS_LABELS: Record<QuarantineStatus, string> = {
  pending: 'Pending Review',
  'under-review': 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  released: 'Released',
  deleted: 'Deleted',
};

export const QUARANTINE_REASON_LABELS: Record<QuarantineReason, string> = {
  malware: 'Malware Detected',
  suspicious: 'Suspicious Content',
  unsigned: 'Unsigned Artifact',
  'invalid-signature': 'Invalid Signature',
  'policy-violation': 'Policy Violation',
  manual: 'Manual Quarantine',
};

export const QUARANTINE_STATUS_COLORS: Record<QuarantineStatus, string> = {
  pending: 'yellow',
  'under-review': 'blue',
  approved: 'green',
  rejected: 'red',
  released: 'gray',
  deleted: 'gray',
};

export const QUARANTINE_REASON_COLORS: Record<QuarantineReason, string> = {
  malware: 'red',
  suspicious: 'orange',
  unsigned: 'yellow',
  'invalid-signature': 'red',
  'policy-violation': 'purple',
  manual: 'gray',
};