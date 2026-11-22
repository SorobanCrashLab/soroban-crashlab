'use client';

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_CHANNELS, loadChannelPreferences, saveChannelPreferences, mockNotifications, type NotificationPreference } from '../notification-preferences-utils';
import {
  loadReadState,
  markNotificationRead,
  markAllNotificationsRead,
  isNotificationRead,
  subscribeToReadStateChanges,
  type ReadState,
} from '../notification-read-state-utils';
import { ListState } from '../../components/ListState';
import { GenericPageSkeleton } from '../../components/LoadingSkeleton';

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [readState, setReadState] = useState<ReadState>(() => (typeof window === 'undefined' ? {} : loadReadState()));
  const [preferences, setPreferences] = useState<NotificationPreference[]>(() => (typeof window === 'undefined' ? [] : loadChannelPreferences()));
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');
  const [loading, setLoading] = useState(true);

  // Cross-tab sync for read state.
  useEffect(() => {
    const unsub = subscribeToReadStateChanges((newState) => {
      setReadState((prev) => {
        const merged = { ...prev };
        for (const [id, ts] of Object.entries(newState)) {
          if (!merged[id] || ts > merged[id]) merged[id] = ts;
        }
        return merged;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate notification preferences once
    setPreferences(loadChannelPreferences());
    setLoading(false);
  }, []);

  const handleMarkAsRead = useCallback((id: string) => {
    setReadState((prev) => markNotificationRead(id, prev));
  }, []);

  const handleMarkAllAsRead = useCallback(() => {
    setReadState((prev) => markAllNotificationsRead(notifications.map(n => n.id), prev));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [notifications]);

  const handleToggleChannel = (channelId: string) => {
    const updated = preferences.map(p =>
      p.channelId === channelId ? { ...p, enabled: !p.enabled } : p
    );
    setPreferences(updated);
    saveChannelPreferences(updated);
  };

  const handleToggleNotificationType = (channelId: string, type: keyof typeof preferences[0]['notificationTypes']) => {
    const updated = preferences.map(p =>
      p.channelId === channelId
        ? { ...p, notificationTypes: { ...p.notificationTypes, [type]: !p.notificationTypes[type] } }
        : p
    );
    setPreferences(updated);
    saveChannelPreferences(updated);
  };

  const handleToggleQuietHours = (channelId: string) => {
    const updated = preferences.map(p =>
      p.channelId === channelId
        ? { ...p, quietHours: { ...p.quietHours, enabled: !p.quietHours.enabled } }
        : p
    );
    setPreferences(updated);
    saveChannelPreferences(updated);
  };

  const resolvedNotifications = notifications.map(n => ({
    ...n,
    read: isNotificationRead(readState, n.id, n.read),
  }));
  const unreadCount = resolvedNotifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Notification Center</h1>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            {unreadCount} unread
          </span>
        </div>

        <div className="flex gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'inbox'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Inbox
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'preferences'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Preferences
          </button>
        </div>

        {activeTab === 'inbox' && (
          <ListState
            {...(loading
              ? { state: 'loading', skeleton: <GenericPageSkeleton variant="list" rows={5} /> }
              : notifications.length === 0
              ? { state: 'empty', message: 'No notifications yet' }
              : { state: 'success' })}
          >
            <div className="space-y-4">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Mark all as read
                </button>
              )}
              {resolvedNotifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleMarkAsRead(notification.id)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    notification.read
                      ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`text-2xl flex-shrink-0`}>
                      {notification.severity === 'error' && '⛔'}
                      {notification.severity === 'warning' && '⚠️'}
                      {notification.severity === 'success' && '✅'}
                      {notification.severity === 'info' && 'ℹ️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{notification.title}</h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{notification.message}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                        {new Date(notification.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-3 h-3 rounded-full bg-blue-600 flex-shrink-0 mt-1"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ListState>
        )}

        {activeTab === 'preferences' && (
          <ListState
            {...(loading
              ? { state: 'loading', skeleton: <GenericPageSkeleton variant="cards" rows={3} /> }
              : { state: 'success' })}
          >
            <div className="space-y-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Customize your notification preferences for each channel
            </p>
            {preferences.map(pref => {
              const channel = DEFAULT_CHANNELS.find(c => c.id === pref.channelId);
              return (
                <div key={pref.channelId} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{channel?.icon}</span>
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{channel?.name}</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{channel?.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pref.enabled}
                        onChange={() => handleToggleChannel(pref.channelId)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-200 dark:bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-zinc-900 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {pref.enabled && (
                    <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <div>
                        <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Notification Types</label>
                        <div className="space-y-2 mt-2">
                          {(['crashes', 'alerts', 'reports', 'updates'] as const).map(type => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={pref.notificationTypes[type]}
                                onChange={() => handleToggleNotificationType(pref.channelId, type)}
                                className="w-4 h-4 rounded border-zinc-300 text-blue-600 cursor-pointer"
                              />
                              <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pref.quietHours.enabled}
                            onChange={() => handleToggleQuietHours(pref.channelId)}
                            className="w-4 h-4 rounded border-zinc-300 text-blue-600 cursor-pointer"
                          />
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Enable Quiet Hours</span>
                        </label>
                        {pref.quietHours.enabled && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input
                              type="time"
                              value={pref.quietHours.start}
                              className="text-sm px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            />
                            <input
                              type="time"
                              value={pref.quietHours.end}
                              className="text-sm px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </ListState>
        )}
      </div>
    </div>
  );
}
