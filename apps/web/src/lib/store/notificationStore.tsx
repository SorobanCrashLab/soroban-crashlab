/**
 * Notification store with categories, states, and real-time updates (issue #2262).
 * 
 * Additive-only changes to existing notification model. The store manages:
 * - Categories: crashes, regressions, campaigns, mentions, integrations, system
 * - States: unread, read, archived, snoozed (with snoozedUntil), muted source
 * - Real-time sync via SSE (Phase 3)
 * - Cross-tab sync via BroadcastChannel (Phase 3)
 * 
 * Uses React Context (no external state library dependency).
 */

'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type NotificationCategory = 
  | 'crashes' 
  | 'regressions' 
  | 'campaigns' 
  | 'mentions' 
  | 'integrations' 
  | 'system';

export type NotificationState = 
  | 'unread' 
  | 'read' 
  | 'archived' 
  | 'snoozed' 
  | 'muted';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  category: NotificationCategory;
  state: NotificationState;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  snoozedUntil?: Date;
  mutedSource?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  
  // Actions
  addNotification: (notification: Omit<Notification, 'state'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  archive: (id: string) => void;
  snooze: (id: string, until: Date) => void;
  mute: (id: string, source: string) => void;
  unmute: (id: string) => void;
  deleteNotification: (id: string) => void;
  
  // Filters
  getByCategory: (category: NotificationCategory) => Notification[];
  getByState: (state: NotificationState) => Notification[];
  getUnread: () => Notification[];
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.state === 'unread').length,
    [notifications]
  );
  
  const addNotification = useCallback((notification: Omit<Notification, 'state'>) => {
    setNotifications((prev) => {
      const newNotification: Notification = {
        ...notification,
        state: 'unread',
        timestamp: notification.timestamp || new Date(),
      };
      
      // Check if notification from muted source
      const existing = prev.find(
        (n) => n.mutedSource === notification.metadata?.source
      );
      if (existing && existing.state === 'muted') {
        newNotification.state = 'muted';
      }
      
      return [newNotification, ...prev];
    });
  }, []);
  
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && n.state === 'unread'
          ? { ...n, state: 'read' }
          : n
      )
    );
  }, []);
  
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.state === 'unread' ? { ...n, state: 'read' } : n))
    );
  }, []);
  
  const archive = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, state: 'archived' } : n))
    );
  }, []);
  
  const snooze = useCallback((id: string, until: Date) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, state: 'snoozed', snoozedUntil: until } : n
      )
    );
  }, []);
  
  const mute = useCallback((id: string, source: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id || n.metadata?.source === source
          ? { ...n, state: 'muted', mutedSource: source }
          : n
      )
    );
  }, []);
  
  const unmute = useCallback((id: string) => {
    setNotifications((prev) => {
      const notification = prev.find((n) => n.id === id);
      if (!notification || notification.state !== 'muted') return prev;
      
      return prev.map((n) =>
        n.mutedSource === notification.mutedSource
          ? { ...n, state: 'unread', mutedSource: undefined }
          : n
      );
    });
  }, []);
  
  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);
  
  const getByCategory = useCallback(
    (category: NotificationCategory) => {
      return notifications.filter((n) => n.category === category);
    },
    [notifications]
  );
  
  const getByState = useCallback(
    (state: NotificationState) => {
      return notifications.filter((n) => n.state === state);
    },
    [notifications]
  );
  
  const getUnread = useCallback(() => {
    return notifications.filter((n) => n.state === 'unread');
  }, [notifications]);
  
  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      archive,
      snooze,
      mute,
      unmute,
      deleteNotification,
      getByCategory,
      getByState,
      getUnread,
    }),
    [
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      archive,
      snooze,
      mute,
      unmute,
      deleteNotification,
      getByCategory,
      getByState,
      getUnread,
    ]
  );
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
