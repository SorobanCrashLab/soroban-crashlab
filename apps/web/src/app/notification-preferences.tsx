'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type NotificationPreferences as Prefs,
  type NotificationType,
  type NotificationPriority,
  type DigestFrequency,
  DEFAULT_PREFERENCES,
  validatePreferences,
  loadPreferences,
  savePreferences,
  toggleType,
  setMinPriority,
  setDigestFrequency,
} from './notification-preferences-utils';

const NOTIFICATION_TYPES: NotificationType[] = ['info', 'success', 'warning', 'error'];
const PRIORITIES: NotificationPriority[] = ['low', 'medium', 'high', 'critical'];
const DIGEST_OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'never', label: 'Never' },
];

const TYPE_LABELS: Record<NotificationType, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

const TYPE_COLORS: Record<NotificationType, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

interface NotificationPreferencesPageProps {
  className?: string;
}

export default function NotificationPreferencesPage({
  className = '',
}: NotificationPreferencesPageProps) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
    setLoaded(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);

    const validationError = validatePreferences(prefs);
    if (validationError) {
      setError(validationError);
      setIsSaving(false);
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      savePreferences(prefs);
      setSaved(true);
    } catch {
      setError('Failed to save preferences.');
    } finally {
      setIsSaving(false);
    }
  }, [prefs]);

  const handleReset = useCallback(() => {
    setPrefs({ ...DEFAULT_PREFERENCES });
    setError(null);
    setSaved(false);
  }, []);

  const handleToggleType = useCallback((type: NotificationType) => {
    setPrefs((prev) => toggleType(prev, type));
    setSaved(false);
  }, []);

  const handleSetPriority = useCallback((priority: NotificationPriority) => {
    setPrefs((prev) => setMinPriority(prev, priority));
    setSaved(false);
  }, []);

  const handleSetDigest = useCallback((frequency: DigestFrequency) => {
    setPrefs((prev) => setDigestFrequency(prev, frequency));
    setSaved(false);
  }, []);

  const handleToggle = useCallback(
    (key: 'soundEnabled' | 'desktopNotifications' | 'emailNotifications' | 'quietHoursEnabled') => {
      setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
      setSaved(false);
    },
    [],
  );

  const handleTimeChange = useCallback(
    (key: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#0A66C2', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Notification Preferences
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
          Configure which notifications you receive and how they are delivered.
        </p>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Preferences saved successfully.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Notification Types */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Notification Types
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Choose which types of notifications to display in your notification center.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {NOTIFICATION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleToggleType(type)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium ${
                  prefs.enabledTypes.includes(type)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
                aria-pressed={prefs.enabledTypes.includes(type)}
              >
                <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[type].split(' ')[0]}`} />
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </section>

        {/* Minimum Priority */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Minimum Priority
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Only show notifications at or above this priority level.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => (
              <button
                key={priority}
                onClick={() => handleSetPriority(priority)}
                className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                  prefs.minPriority === priority
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
                aria-pressed={prefs.minPriority === priority}
              >
                {PRIORITY_LABELS[priority]}
              </button>
            ))}
          </div>
        </section>

        {/* Digest Frequency */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Digest Frequency
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            How often would you like to receive notification summaries?
          </p>
          <div className="flex flex-wrap gap-2">
            {DIGEST_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSetDigest(option.value)}
                className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                  prefs.digestFrequency === option.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
                aria-pressed={prefs.digestFrequency === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Delivery Channels */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Delivery Channels
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Choose how notifications are delivered.
          </p>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Sound
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Play a sound when new notifications arrive
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={() => handleToggle('soundEnabled')}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Desktop Notifications
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Show browser notifications for important alerts
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.desktopNotifications}
                onChange={() => handleToggle('desktopNotifications')}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Email Notifications
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Receive email digests based on your frequency setting
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.emailNotifications}
                onChange={() => handleToggle('emailNotifications')}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
        </section>

        {/* Quiet Hours */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Quiet Hours
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Suppress notifications during specific hours (sound and desktop only).
          </p>

          <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors mb-4">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Enable Quiet Hours
            </span>
            <input
              type="checkbox"
              checked={prefs.quietHoursEnabled}
              onChange={() => handleToggle('quietHoursEnabled')}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          {prefs.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="quiet-start"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Start Time
                </label>
                <input
                  type="time"
                  id="quiet-start"
                  value={prefs.quietHoursStart}
                  onChange={(e) => handleTimeChange('quietHoursStart', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="quiet-end"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  End Time
                </label>
                <input
                  type="time"
                  id="quiet-end"
                  value={prefs.quietHoursEnd}
                  onChange={(e) => handleTimeChange('quietHoursEnd', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2.5 bg-[#0A66C2] text-white rounded-lg font-medium text-sm hover:bg-[#084a8a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSaving && (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          )}
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </button>
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-6 py-2.5 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
