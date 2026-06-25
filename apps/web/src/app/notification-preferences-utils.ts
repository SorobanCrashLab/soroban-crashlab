'use client';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type DigestFrequency = 'realtime' | 'hourly' | 'daily' | 'never';

export interface NotificationPreferences {
  enabledTypes: NotificationType[];
  minPriority: NotificationPriority;
  digestFrequency: DigestFrequency;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  emailNotifications: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabledTypes: ['info', 'success', 'warning', 'error'],
  minPriority: 'low',
  digestFrequency: 'realtime',
  soundEnabled: false,
  desktopNotifications: true,
  emailNotifications: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const STORAGE_KEY = 'crashlab:notification-preferences';

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function getPriorityOrder(p: NotificationPriority): number {
  return PRIORITY_ORDER[p] ?? 0;
}

export function meetsMinPriority(
  priority: NotificationPriority,
  minPriority: NotificationPriority,
): boolean {
  return getPriorityOrder(priority) >= getPriorityOrder(minPriority);
}

export function isTypeEnabled(
  type: NotificationType,
  enabledTypes: NotificationType[],
): boolean {
  return enabledTypes.includes(type);
}

export function filterByPreferences(
  notification: { type: NotificationType; priority: NotificationPriority },
  prefs: NotificationPreferences,
): boolean {
  return (
    isTypeEnabled(notification.type, prefs.enabledTypes) &&
    meetsMinPriority(notification.priority, prefs.minPriority)
  );
}

export function isInQuietHours(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  if (!prefs.quietHoursEnabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
  const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function validatePreferences(
  prefs: NotificationPreferences,
): string | null {
  if (prefs.enabledTypes.length === 0) {
    return 'At least one notification type must be enabled.';
  }

  if (prefs.quietHoursEnabled) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(prefs.quietHoursStart)) {
      return 'Invalid quiet hours start time.';
    }
    if (!timeRegex.test(prefs.quietHoursEnd)) {
      return 'Invalid quiet hours end time.';
    }
    if (prefs.quietHoursStart === prefs.quietHoursEnd) {
      return 'Quiet hours start and end cannot be the same.';
    }
  }

  return null;
}

export function loadPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PREFERENCES };
}

export function savePreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

export function toggleType(
  prefs: NotificationPreferences,
  type: NotificationType,
): NotificationPreferences {
  const enabled = prefs.enabledTypes.includes(type)
    ? prefs.enabledTypes.filter((t) => t !== type)
    : [...prefs.enabledTypes, type];
  return { ...prefs, enabledTypes: enabled };
}

export function setMinPriority(
  prefs: NotificationPreferences,
  priority: NotificationPriority,
): NotificationPreferences {
  return { ...prefs, minPriority: priority };
}

export function setDigestFrequency(
  prefs: NotificationPreferences,
  frequency: DigestFrequency,
): NotificationPreferences {
  return { ...prefs, digestFrequency: frequency };
}
