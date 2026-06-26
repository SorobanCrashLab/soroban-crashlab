'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { loadPreferences, filterByPreferences, isInQuietHours } from './notification-preferences-utils';
import type { NotificationType, NotificationPriority } from './notification-preferences-utils';
import { api, type NotificationFeedItem } from '../lib/api-client';

export type { NotificationType, NotificationPriority };

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionLabel?: string;
  actionUrl?: string;
  dismissible?: boolean;
  runId?: string;
}

interface NotificationCenterProps {
  className?: string;
}

const POLL_INTERVAL_MS = 30000;

function mapFeedItemToNotification(item: NotificationFeedItem): Notification {
  const priorityMap: Record<string, NotificationPriority> = {
    error: 'critical',
    warning: 'high',
    success: 'medium',
    info: 'low',
  };
  return {
    id: item.id,
    type: item.severity,
    priority: priorityMap[item.severity] ?? 'low',
    title: item.title,
    message: item.message,
    timestamp: new Date(item.createdAt),
    read: item.read,
    dismissible: true,
  };
}

export default function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prefs = loadPreferences();

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.notifications.list();
      const feed: NotificationFeedItem[] = data.notifications ?? [];
      const mapped = feed.map(mapFeedItemToNotification);
      setNotifications((prev) => {
        const prevIds = new Set(prev.map((n) => n.id));
        const merged = prev.filter((n) => feed.some((f) => f.id === n.id));
        for (const item of mapped) {
          if (!prevIds.has(item.id)) {
            merged.push(item);
          } else {
            const existing = prev.find((n) => n.id === item.id);
            if (existing) merged.push({ ...item, read: existing.read });
          }
        }
        return merged;
      });
    } catch {
      // silently fail — keep existing notifications
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchNotifications();
    });
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    let mounted = true;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && mounted) {
        fetchNotifications();
      }
    };
    const handleFocus = () => {
      if (mounted) fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchNotifications]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const effectiveNotifications = notifications.filter((n) =>
    filterByPreferences(n, prefs),
  );
  const unreadCount = effectiveNotifications.filter(n => !n.read).length;
  const filteredNotifications = filter === 'unread' 
    ? effectiveNotifications.filter(n => !n.read)
    : effectiveNotifications;

  const markAsRead = (id: string) => {
    setNotifications((prev: Notification[]) => 
      prev.map((n: Notification) => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev: Notification[]) => 
      prev.map((n: Notification) => ({ ...n, read: true }))
    );
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev: Notification[]) => prev.filter((n: Notification) => n.id !== id));
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getIconStyles = (type: NotificationType) => {
    switch (type) {
      case 'error':
        return "text-red-600 dark:text-red-400";
      case 'warning':
        return "text-amber-600 dark:text-amber-400";
      case 'success':
        return "text-green-600 dark:text-green-400";
      case 'info':
      default:
        return "text-blue-600 dark:text-blue-400";
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 max-h-96 flex flex-col"
          role="menu"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
            
            {/* Filter Tabs */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === 'all'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === 'unread'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto" aria-live="polite">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`relative group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                      !notification.read ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''
                    }`}
                    role="menuitem"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`flex-shrink-0 ${getIconStyles(notification.type)}`}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`text-sm font-medium ${
                              !notification.read 
                                ? 'text-zinc-900 dark:text-zinc-100' 
                                : 'text-zinc-700 dark:text-zinc-300'
                            }`}>
                              {notification.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                              )}
                              {notification.dismissible && (
                                <button
                                  onClick={() => dismissNotification(notification.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-all"
                                  aria-label="Dismiss notification"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {formatTimestamp(notification.timestamp)}
                            </span>
                            
                            <div className="flex items-center gap-2">
                              {!notification.read && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
                                >
                                  Mark read
                                </button>
                              )}
                              
                              {notification.actionLabel && notification.actionUrl && (
                                <a
                                  href={notification.actionUrl}
                                  onClick={() => {
                                    markAsRead(notification.id);
                                    setIsOpen(false);
                                  }}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
                                >
                                  {notification.actionLabel}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-b-xl">
            <Link
              href="/settings/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Notification Preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}