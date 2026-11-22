'use client';

import { useState, useCallback } from 'react';
import {
  type NotificationPreferences as Prefs,
  type NotificationType,
  type NotificationPriority,
  type DigestFrequency,
  DEFAULT_PREFERENCES,
  getQuietHoursPreviewText,
  validatePreferences,
  loadPreferences,
  savePreferences,
  toggleType,
  setMinPriority,
  setDigestFrequency,
} from './notification-preferences-utils';
import { useTranslations } from '../i18n/context';
import type { MessageKey } from '../i18n/generated/keys';

const NOTIFICATION_TYPES: NotificationType[] = ['info', 'success', 'warning', 'error'];
const PRIORITIES: NotificationPriority[] = ['low', 'medium', 'high', 'critical'];
const DIGEST_OPTIONS: DigestFrequency[] = ['realtime', 'hourly', 'daily', 'never'];

const TYPE_COLORS: Record<NotificationType, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// Explicit per-value key maps (rather than dynamic `types.${type}` lookups)
// so a typo is a compile error against the generated `MessageKey` union.
const TYPE_KEYS: Record<NotificationType, MessageKey> = {
  info: 'notifications.types.info',
  success: 'notifications.types.success',
  warning: 'notifications.types.warning',
  error: 'notifications.types.error',
};

const PRIORITY_KEYS: Record<NotificationPriority, MessageKey> = {
  low: 'notifications.priority.low',
  medium: 'notifications.priority.medium',
  high: 'notifications.priority.high',
  critical: 'notifications.priority.critical',
};

const DIGEST_KEYS: Record<DigestFrequency, MessageKey> = {
  realtime: 'notifications.digest.realtime',
  hourly: 'notifications.digest.hourly',
  daily: 'notifications.digest.daily',
  never: 'notifications.digest.never',
};

interface NotificationPreferencesPageProps {
  className?: string;
}

export default function NotificationPreferencesPage({
  className = '',
}: NotificationPreferencesPageProps) {
  const { t } = useTranslations();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPreferences());
  const [loaded] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      setError(t('notifications.preferences.saveFailedMessage'));
    } finally {
      setIsSaving(false);
    }
  }, [prefs, t]);

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
          {t('notifications.preferences.title')}
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
          {t('notifications.preferences.subtitle')}
        </p>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {t('notifications.preferences.savedMessage')}
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
            {t('notifications.types.title')}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
            {t('notifications.types.subtitle')}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
            {t('notifications.preferences.enabledTypesCount', { count: prefs.enabledTypes.length })}
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
                {t(TYPE_KEYS[type])}
              </button>
            ))}
          </div>
        </section>

        {/* Minimum Priority */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            {t('notifications.priority.title')}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {t('notifications.priority.subtitle')}
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
                {t(PRIORITY_KEYS[priority])}
              </button>
            ))}
          </div>
        </section>

        {/* Digest Frequency */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            {t('notifications.digest.title')}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {t('notifications.digest.subtitle')}
          </p>
          <div className="flex flex-wrap gap-2">
            {DIGEST_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => handleSetDigest(option)}
                className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                  prefs.digestFrequency === option
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
                aria-pressed={prefs.digestFrequency === option}
              >
                {t(DIGEST_KEYS[option])}
              </button>
            ))}
          </div>
        </section>

        {/* Delivery Channels */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            {t('notifications.channels.title')}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {t('notifications.channels.subtitle')}
          </p>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {t('notifications.channels.soundLabel')}
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t('notifications.channels.soundDescription')}
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
                  {t('notifications.channels.desktopLabel')}
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t('notifications.channels.desktopDescription')}
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
                  {t('notifications.channels.emailLabel')}
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t('notifications.channels.emailDescription')}
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
            {t('notifications.quietHours.title')}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {t('notifications.quietHours.subtitle')}
          </p>

          <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors mb-4">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {t('notifications.quietHours.enable')}
            </span>
            <input
              type="checkbox"
              checked={prefs.quietHoursEnabled}
              onChange={() => handleToggle('quietHoursEnabled')}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          {prefs.quietHoursEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="quiet-start"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    {t('notifications.quietHours.start')}
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
                    {t('notifications.quietHours.end')}
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
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {getQuietHoursPreviewText(prefs.quietHoursStart, prefs.quietHoursEnd)}
              </p>
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
          {isSaving ? t('notifications.preferences.savingButton') : t('notifications.preferences.saveButton')}
        </button>
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-6 py-2.5 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {t('notifications.preferences.resetButton')}
        </button>
      </div>
    </div>
  );
}
