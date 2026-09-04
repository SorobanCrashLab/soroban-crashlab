export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type DigestFrequency = 'realtime' | 'hourly' | 'daily' | 'never';

export interface NotificationPreferences {
  enabledTypes: NotificationType[];
  minPriority: NotificationPriority;
  digestFrequency: DigestFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  emailNotifications: boolean;
}

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: string;
}

export interface NotificationPreference {
  channelId: string;
  enabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  notificationTypes: {
    crashes: boolean;
    alerts: boolean;
    reports: boolean;
    updates: boolean;
  };
  priority?: NotificationPriority;
  digestFrequency?: DigestFrequency;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  channel?: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  read: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabledTypes: ['info', 'success', 'warning', 'error'],
  minPriority: 'low',
  digestFrequency: 'realtime',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  soundEnabled: false,
  desktopNotifications: true,
  emailNotifications: false,
};

export const DEFAULT_CHANNELS: NotificationChannel[] = [
  {
    id: 'in-app',
    name: 'In-App Notifications',
    description: 'Receive notifications within the dashboard',
    enabled: true,
    icon: '🔔',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Receive notifications via email',
    enabled: true,
    icon: '📧',
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: 'Send notifications to a webhook endpoint',
    enabled: false,
    icon: '🔗',
  },
];

export const DEFAULT_CHANNEL_PREFERENCES: NotificationPreference[] = DEFAULT_CHANNELS.map(
  (channel) => ({
    channelId: channel.id,
    enabled: channel.enabled,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
    notificationTypes: {
      crashes: true,
      alerts: true,
      reports: true,
      updates: channel.id === 'in-app',
    },
  }),
);

const SETTINGS_STORAGE_KEY = 'notification-global-preferences';
const CHANNEL_STORAGE_KEY = 'notification-channel-preferences';

function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.enabledTypes) && typeof row.minPriority === 'string';
}

export const savePreferences = (prefs: NotificationPreferences): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save notification settings:', e);
  }
};

export const loadPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(stored) as unknown;
    if (isNotificationPreferences(parsed)) {
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
    return { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const saveChannelPreferences = (prefs: NotificationPreference[]): void => {
  try {
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save channel notification preferences:', e);
  }
};

export const loadChannelPreferences = (): NotificationPreference[] => {
  try {
    const stored = localStorage.getItem(CHANNEL_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as NotificationPreference[]) : DEFAULT_CHANNEL_PREFERENCES;
  } catch {
    return DEFAULT_CHANNEL_PREFERENCES;
  }
};

export function validateQuietHoursTime(time: string): boolean {
  if (!time || typeof time !== 'string') return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time.trim());
}

export function parseQuietHoursMinutes(time: string): number | null {
  if (!validateQuietHoursTime(time)) return null;
  const [h, m] = time.trim().split(':').map(Number);
  return h * 60 + m;
}

/**
 * Canonical wrap-aware quiet hours evaluator.
 * Boundary minute inclusivity:
 * - Start minute is INCLUSIVE (nowMinutes >= startMinutes).
 * - End minute is EXCLUSIVE (nowMinutes < endMinutes).
 */
export function isQuietHoursActive(
  start: string,
  end: string,
  now: Date = new Date(),
): boolean {
  const startMinutes = parseQuietHoursMinutes(start);
  const endMinutes = parseQuietHoursMinutes(end);
  if (startMinutes === null || endMinutes === null) return false;
  if (startMinutes === endMinutes) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    // Normal window (e.g. 08:00 - 17:00)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Wraparound window (e.g. 22:00 - 08:00 or 08:00 - 02:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function getQuietHoursPreviewText(start: string, end: string): string {
  const startM = parseQuietHoursMinutes(start);
  const endM = parseQuietHoursMinutes(end);
  if (startM === null || endM === null) {
    return 'Invalid time format. Use HH:MM.';
  }
  if (startM === endM) {
    return 'Quiet hours start and end times cannot be identical.';
  }
  if (startM < endM) {
    return `Quiet hours active daily from ${start} to ${end}.`;
  }
  return `Quiet hours active overnight from ${start} until ${end} the next day (wraparound window).`;
}

export function isInQuietHours(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  if (!prefs.quietHoursEnabled) return false;
  return isQuietHoursActive(prefs.quietHoursStart, prefs.quietHoursEnd, now);
}

export function filterByPreferences(
  notification: { type: NotificationType; priority: NotificationPriority },
  prefs: NotificationPreferences,
): boolean {
  if (!prefs.enabledTypes.includes(notification.type)) return false;
  return PRIORITY_RANK[notification.priority] >= PRIORITY_RANK[prefs.minPriority];
}

export function toggleType(
  prefs: NotificationPreferences,
  type: NotificationType,
): NotificationPreferences {
  const enabled = prefs.enabledTypes.includes(type);
  if (enabled && prefs.enabledTypes.length <= 1) return prefs;
  return {
    ...prefs,
    enabledTypes: enabled
      ? prefs.enabledTypes.filter((entry) => entry !== type)
      : [...prefs.enabledTypes, type],
  };
}

export function setMinPriority(
  prefs: NotificationPreferences,
  minPriority: NotificationPriority,
): NotificationPreferences {
  return { ...prefs, minPriority };
}

export function setDigestFrequency(
  prefs: NotificationPreferences,
  digestFrequency: DigestFrequency,
): NotificationPreferences {
  return { ...prefs, digestFrequency };
}

export function validatePreferences(prefs: NotificationPreferences): string | null {
  if (!prefs.enabledTypes.length) {
    return 'At least one notification type must be enabled.';
  }
  if (prefs.quietHoursEnabled) {
    if (!validateQuietHoursTime(prefs.quietHoursStart) || !validateQuietHoursTime(prefs.quietHoursEnd)) {
      return 'Quiet hours start and end must be valid HH:MM times.';
    }
    if (prefs.quietHoursStart === prefs.quietHoursEnd) {
      return 'Quiet hours start and end times cannot be identical.';
    }
  }
  return null;
}

export const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Critical Crash Detected',
    message: 'Run #2847 detected a critical authorization failure',
    channel: 'in-app',
    severity: 'error',
    timestamp: new Date(Date.now() - 300000),
    read: false,
  },
  {
    id: '2',
    title: 'Campaign Milestone Reached',
    message: 'Contract fuzzing campaign has completed 1M mutations',
    channel: 'email',
    severity: 'success',
    timestamp: new Date(Date.now() - 600000),
    read: true,
  },
  {
    id: '3',
    title: 'Alert: High Resource Fee',
    message: 'Run #2846 exceeded resource fee threshold',
    channel: 'in-app',
    severity: 'warning',
    timestamp: new Date(Date.now() - 900000),
    read: true,
  },
];
