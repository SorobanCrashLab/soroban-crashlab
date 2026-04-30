export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertChannel = "email" | "slack" | "webhook" | "sms";
export type AlertCondition = "threshold" | "trend" | "anomaly" | "consecutive";
export type AlertCategory = "performance" | "reliability" | "security" | "resource";
export type AlertingTabId = "rules" | "channels" | "history";
export type AlertingLoadState = "loading" | "error" | "success";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  category: AlertCategory;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  threshold: number;
  unit: string;
  channels: AlertChannel[];
  cooldown: number;
  tags: string[];
  createdAt: string;
  lastTriggered?: string;
}

export interface NotificationChannel {
  id: string;
  type: AlertChannel;
  name: string;
  enabled: boolean;
  config: Record<string, string | string[] | number | boolean>;
}

export type AlertOutcome = "triggered" | "suppressed" | "resolved";

export interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  outcome: AlertOutcome;
  channel: AlertChannel;
  occurredAt: string;
  detail: string;
}

export interface AlertingSettingsSnapshot {
  alertRules: AlertRule[];
  channels: NotificationChannel[];
  history: AlertHistoryEntry[];
  lastUpdated: string;
}

export interface AlertingSettingsSummary {
  totalRules: number;
  activeRules: number;
  enabledChannels: number;
  criticalRules: number;
  recentHistoryEntries: number;
}

export interface AlertingSettingsLoadResult {
  status: AlertingLoadState;
  snapshot: AlertingSettingsSnapshot | null;
  error: string | null;
}

export const ALERTING_SETTINGS_STORAGE_KEY =
  "crashlab:alerting-settings:v1";

export const ALERTING_TABS: AlertingTabId[] = [
  "rules",
  "channels",
  "history",
];

const DEFAULT_RULES: Omit<AlertRule, "createdAt" | "lastTriggered">[] = [
  {
    id: "crash-rate-spike",
    name: "Crash Rate Spike",
    description:
      "Alert when the crash rate increases significantly over a short period.",
    category: "reliability",
    enabled: true,
    severity: "high",
    condition: "threshold",
    threshold: 15,
    unit: "%",
    channels: ["email", "slack"],
    cooldown: 30,
    tags: ["critical", "fuzzing"],
  },
  {
    id: "resource-exhaustion",
    name: "Resource Exhaustion",
    description: "Alert when runs consistently hit CPU or memory limits.",
    category: "resource",
    enabled: false,
    severity: "medium",
    condition: "consecutive",
    threshold: 5,
    unit: "runs",
    channels: ["email"],
    cooldown: 60,
    tags: ["performance", "resource"],
  },
  {
    id: "consecutive-failures",
    name: "Consecutive Failures",
    description: "Alert when multiple consecutive fuzzing runs fail.",
    category: "reliability",
    enabled: true,
    severity: "critical",
    condition: "consecutive",
    threshold: 3,
    unit: "failures",
    channels: ["email", "slack", "sms"],
    cooldown: 15,
    tags: ["critical", "reliability"],
  },
  {
    id: "memory-anomaly",
    name: "Memory Usage Anomaly",
    description:
      "Alert when memory usage patterns deviate significantly from baseline.",
    category: "performance",
    enabled: true,
    severity: "medium",
    condition: "anomaly",
    threshold: 2.5,
    unit: "std dev",
    channels: ["webhook"],
    cooldown: 120,
    tags: ["performance", "anomaly"],
  },
  {
    id: "security-violation",
    name: "Security Violation Detected",
    description:
      "Alert when potential security vulnerabilities are discovered.",
    category: "security",
    enabled: true,
    severity: "critical",
    condition: "threshold",
    threshold: 1,
    unit: "violation",
    channels: ["email", "slack", "sms"],
    cooldown: 5,
    tags: ["security", "critical"],
  },
];

const DEFAULT_CHANNELS: NotificationChannel[] = [
  {
    id: "email-primary",
    type: "email",
    name: "Primary Email",
    enabled: true,
    config: { recipients: ["admin@crashlab.dev", "alerts@crashlab.dev"] },
  },
  {
    id: "slack-dev",
    type: "slack",
    name: "Dev Team Slack",
    enabled: true,
    config: { webhook: "https://hooks.slack.com/...", channel: "#crashlab-alerts" },
  },
  {
    id: "webhook-monitoring",
    type: "webhook",
    name: "Monitoring System",
    enabled: false,
    config: { url: "https://monitoring.example.com/webhook", secret: "***" },
  },
  {
    id: "sms-oncall",
    type: "sms",
    name: "On-Call SMS",
    enabled: true,
    config: { numbers: ["+1234567890"] },
  },
];

const DEFAULT_HISTORY: AlertHistoryEntry[] = [
  {
    id: "history-1",
    ruleId: "crash-rate-spike",
    ruleName: "Crash Rate Spike",
    outcome: "triggered",
    channel: "slack",
    occurredAt: "2026-04-27T09:30:00.000Z",
    detail: "Spike confirmed after three consecutive failed runs.",
  },
  {
    id: "history-2",
    ruleId: "consecutive-failures",
    ruleName: "Consecutive Failures",
    outcome: "resolved",
    channel: "email",
    occurredAt: "2026-04-27T07:15:00.000Z",
    detail: "Failure window closed after a successful replay.",
  },
  {
    id: "history-3",
    ruleId: "security-violation",
    ruleName: "Security Violation Detected",
    outcome: "suppressed",
    channel: "sms",
    occurredAt: "2026-04-26T22:05:00.000Z",
    detail: "Alert muted because the tracker was in maintenance mode.",
  },
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isAlertChannel = (value: unknown): value is AlertChannel =>
  value === "email" ||
  value === "slack" ||
  value === "webhook" ||
  value === "sms";

const isAlertSeverity = (value: unknown): value is AlertSeverity =>
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "critical";

const isAlertCondition = (value: unknown): value is AlertCondition =>
  value === "threshold" ||
  value === "trend" ||
  value === "anomaly" ||
  value === "consecutive";

const isAlertCategory = (value: unknown): value is AlertCategory =>
  value === "performance" ||
  value === "reliability" ||
  value === "security" ||
  value === "resource";

const isIsoDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function cloneRule(rule: AlertRule): AlertRule {
  return {
    ...rule,
    channels: [...rule.channels],
    tags: [...rule.tags],
  };
}

function cloneChannel(channel: NotificationChannel): NotificationChannel {
  return {
    ...channel,
    config: Object.fromEntries(
      Object.entries(channel.config).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, [...value]];
        }
        return [key, value];
      }),
    ),
  };
}

function cloneHistoryEntry(entry: AlertHistoryEntry): AlertHistoryEntry {
  return { ...entry };
}

function createReferenceDate(referenceTime: Date): Date {
  return new Date(referenceTime.getTime());
}

function buildDefaultRules(referenceTime: Date): AlertRule[] {
  return DEFAULT_RULES.map((rule, index) => {
    const createdAt = new Date(
      referenceTime.getTime() - (7 - index) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const lastTriggered =
      rule.enabled && index % 2 === 0
        ? new Date(referenceTime.getTime() - (index + 1) * 60 * 60 * 1000).toISOString()
        : undefined;

    return {
      ...rule,
      channels: [...rule.channels],
      tags: [...rule.tags],
      createdAt,
      lastTriggered,
    };
  });
}

function buildDefaultChannels(): NotificationChannel[] {
  return DEFAULT_CHANNELS.map(cloneChannel);
}

function buildDefaultHistory(referenceTime: Date): AlertHistoryEntry[] {
  return DEFAULT_HISTORY.map((entry, index) => ({
    ...entry,
    occurredAt: new Date(referenceTime.getTime() - index * 90 * 60 * 1000).toISOString(),
  }));
}

export function createDefaultAlertingSettingsSnapshot(
  referenceTime = new Date(),
): AlertingSettingsSnapshot {
  const now = createReferenceDate(referenceTime);

  return {
    alertRules: buildDefaultRules(now),
    channels: buildDefaultChannels(),
    history: buildDefaultHistory(now),
    lastUpdated: now.toISOString(),
  };
}

export function serializeAlertingSettingsSnapshot(
  snapshot: AlertingSettingsSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

function parseRule(rawRule: unknown): AlertRule | null {
  if (!isObject(rawRule)) return null;
  const { id, name, description, category, enabled, severity, condition, threshold, unit, channels, cooldown, tags, createdAt, lastTriggered } =
    rawRule;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    !isAlertCategory(category) ||
    typeof enabled !== "boolean" ||
    !isAlertSeverity(severity) ||
    !isAlertCondition(condition) ||
    typeof threshold !== "number" ||
    typeof unit !== "string" ||
    !isStringArray(channels) ||
    !channels.every(isAlertChannel) ||
    typeof cooldown !== "number" ||
    !isStringArray(tags) ||
    !isIsoDateString(createdAt) ||
    (lastTriggered !== undefined && !isIsoDateString(lastTriggered))
  ) {
    return null;
  }

  return {
    id,
    name,
    description,
    category,
    enabled,
    severity,
    condition,
    threshold,
    unit,
    channels,
    cooldown,
    tags,
    createdAt,
    lastTriggered: lastTriggered as string | undefined,
  };
}

function parseChannel(rawChannel: unknown): NotificationChannel | null {
  if (!isObject(rawChannel)) return null;
  const { id, type, name, enabled, config } = rawChannel;

  if (
    typeof id !== "string" ||
    !isAlertChannel(type) ||
    typeof name !== "string" ||
    typeof enabled !== "boolean" ||
    !isObject(config)
  ) {
    return null;
  }

  const entries = Object.entries(config);
  if (
    entries.length === 0 ||
    entries.some(([, value]) =>
      !(
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        isStringArray(value)
      ),
    )
  ) {
    return null;
  }

  return {
    id,
    type,
    name,
    enabled,
    config: Object.fromEntries(
      entries.map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
    ) as Record<string, string | number | boolean | string[]>,
  };
}

function parseHistoryEntry(rawEntry: unknown): AlertHistoryEntry | null {
  if (!isObject(rawEntry)) return null;
  const { id, ruleId, ruleName, outcome, channel, occurredAt, detail } = rawEntry;

  if (
    typeof id !== "string" ||
    typeof ruleId !== "string" ||
    typeof ruleName !== "string" ||
    (outcome !== "triggered" && outcome !== "suppressed" && outcome !== "resolved") ||
    !isAlertChannel(channel) ||
    !isIsoDateString(occurredAt) ||
    typeof detail !== "string"
  ) {
    return null;
  }

  return {
    id,
    ruleId,
    ruleName,
    outcome,
    channel,
    occurredAt,
    detail,
  };
}

export function readAlertingSettingsSnapshot(
  serialized: string | null,
  referenceTime = new Date(),
): AlertingSettingsLoadResult {
  if (serialized === null) {
    return {
      status: "success",
      snapshot: createDefaultAlertingSettingsSnapshot(referenceTime),
      error: null,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      status: "error",
      snapshot: null,
      error: "Stored alerting settings are not valid JSON.",
    };
  }

  if (!isObject(parsed)) {
    return {
      status: "error",
      snapshot: null,
      error: "Stored alerting settings are missing required data.",
    };
  }

  const alertRules = Array.isArray(parsed.alertRules)
    ? parsed.alertRules.map(parseRule)
    : null;
  const channels = Array.isArray(parsed.channels)
    ? parsed.channels.map(parseChannel)
    : null;
  const history = Array.isArray(parsed.history)
    ? parsed.history.map(parseHistoryEntry)
    : null;
  const lastUpdated = parsed.lastUpdated;

  if (
    !alertRules ||
    !channels ||
    !history ||
    alertRules.some((entry) => entry === null) ||
    channels.some((entry) => entry === null) ||
    history.some((entry) => entry === null) ||
    !isIsoDateString(lastUpdated)
  ) {
    return {
      status: "error",
      snapshot: null,
      error: "Stored alerting settings are incomplete or outdated.",
    };
  }

  return {
    status: "success",
    snapshot: {
      alertRules: alertRules.map((rule) => cloneRule(rule as AlertRule)),
      channels: channels.map((channel) => cloneChannel(channel as NotificationChannel)),
      history: history.map((entry) => cloneHistoryEntry(entry as AlertHistoryEntry)),
      lastUpdated,
    },
    error: null,
  };
}

export function toggleAlertRule(
  snapshot: AlertingSettingsSnapshot,
  ruleId: string,
): AlertingSettingsSnapshot {
  return {
    ...snapshot,
    alertRules: snapshot.alertRules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : cloneRule(rule),
    ),
    lastUpdated: new Date().toISOString(),
  };
}

export function updateAlertRuleThreshold(
  snapshot: AlertingSettingsSnapshot,
  ruleId: string,
  value: string | number,
): AlertingSettingsSnapshot {
  const nextValue = typeof value === "number" ? value : Number(value);

  return {
    ...snapshot,
    alertRules: snapshot.alertRules.map((rule) =>
      rule.id === ruleId && Number.isFinite(nextValue)
        ? { ...rule, threshold: nextValue }
        : cloneRule(rule),
    ),
    lastUpdated: new Date().toISOString(),
  };
}

export function toggleNotificationChannel(
  snapshot: AlertingSettingsSnapshot,
  channelId: string,
): AlertingSettingsSnapshot {
  return {
    ...snapshot,
    channels: snapshot.channels.map((channel) =>
      channel.id === channelId
        ? { ...channel, enabled: !channel.enabled }
        : cloneChannel(channel),
    ),
    lastUpdated: new Date().toISOString(),
  };
}

export function filterAlertRulesByCategory(
  alertRules: AlertRule[],
  category: AlertCategory | "all",
): AlertRule[] {
  return alertRules.filter(
    (rule) => category === "all" || rule.category === category,
  );
}

export function buildAlertingSettingsSummary(
  snapshot: AlertingSettingsSnapshot,
): AlertingSettingsSummary {
  return {
    totalRules: snapshot.alertRules.length,
    activeRules: snapshot.alertRules.filter((rule) => rule.enabled).length,
    enabledChannels: snapshot.channels.filter((channel) => channel.enabled).length,
    criticalRules: snapshot.alertRules.filter(
      (rule) => rule.enabled && rule.severity === "critical",
    ).length,
    recentHistoryEntries: snapshot.history.length,
  };
}

export function validateAlertingSettingsSnapshot(
  snapshot: AlertingSettingsSnapshot,
): string | null {
  for (const rule of snapshot.alertRules) {
    if (!rule.enabled) {
      continue;
    }

    if (!rule.name.trim()) {
      return "Each alert rule needs a name before saving.";
    }

    if (!Number.isFinite(rule.threshold) || rule.threshold <= 0) {
      return `Threshold for ${rule.name} must be greater than zero.`;
    }

    if (rule.unit === "%" && rule.threshold > 100) {
      return `Threshold for ${rule.name} cannot exceed 100%.`;
    }

    if (rule.cooldown < 0) {
      return `Cooldown for ${rule.name} must be zero or more.`;
    }
  }

  if (snapshot.channels.length === 0) {
    return "Add at least one notification channel before saving.";
  }

  if (!snapshot.channels.some((channel) => channel.enabled)) {
    return "Enable at least one notification channel before saving.";
  }

  return null;
}

export function formatRelativeTime(
  value: string | undefined,
  referenceTime = new Date(),
): string {
  if (!value) return "Never";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";

  const diffMs = Math.max(0, referenceTime.getTime() - timestamp);
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }

  if (hours > 0) {
    return `${hours}h ago`;
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes > 0) {
    return `${minutes}m ago`;
  }

  return "Recently";
}

export function getNextAlertingTab(
  current: AlertingTabId,
  key: string,
): AlertingTabId {
  const index = ALERTING_TABS.indexOf(current);
  if (index === -1) return "rules";

  if (key === "Home") return ALERTING_TABS[0];
  if (key === "End") return ALERTING_TABS[ALERTING_TABS.length - 1];

  if (key === "ArrowRight" || key === "ArrowDown") {
    return ALERTING_TABS[(index + 1) % ALERTING_TABS.length];
  }

  if (key === "ArrowLeft" || key === "ArrowUp") {
    return ALERTING_TABS[(index - 1 + ALERTING_TABS.length) % ALERTING_TABS.length];
  }

  return current;
}
