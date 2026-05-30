import { NextRequest, NextResponse } from 'next/server';

interface NotificationFeedItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
}

interface NotificationFeedResponse {
  notifications: NotificationFeedItem[];
  total: number;
  optional: true;
}

function isFalsyToggle(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return ["0", "false", "off", "no"].includes(value.toLowerCase());
}

function sanitizeNotificationFeedItem(
  item: Partial<NotificationFeedItem>,
): NotificationFeedItem | null {
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.read !== 'boolean'
  ) {
    return null;
  }

  const allowedSeverity = new Set(['info', 'success', 'warning', 'error']);
  const severity = allowedSeverity.has(item.severity ?? '')
    ? (item.severity as NotificationFeedItem['severity'])
    : 'info';

  return {
    id: item.id,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    read: item.read,
    severity,
  };
}

function buildEmptyFeed(): NotificationFeedResponse {
  return {
    notifications: [],
    total: 0,
    optional: true,
  };
}

async function fetchNotificationsFeed(request: NextRequest, feedUrl: string): Promise<NotificationFeedResponse> {
  const target = new URL(feedUrl, request.nextUrl.origin);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    target.searchParams.set(key, value);
  }

  const response = await fetch(target.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return buildEmptyFeed();
  }

  const payload = (await response.json()) as Partial<NotificationFeedResponse> & {
    notifications?: Partial<NotificationFeedItem>[];
  };

  if (!Array.isArray(payload.notifications)) {
    return buildEmptyFeed();
  }

  const notifications = payload.notifications
    .map((item) => sanitizeNotificationFeedItem(item))
    .filter((item): item is NotificationFeedItem => item !== null);

  return {
    notifications,
    total: typeof payload.total === 'number' ? payload.total : notifications.length,
    optional: true,
  };
}

export async function GET(request: NextRequest) {
  if (isFalsyToggle(request.nextUrl.searchParams.get('enabled'))) {
    return NextResponse.json(buildEmptyFeed());
  }

  if (isFalsyToggle(process.env.NOTIFICATIONS_FEED_ENABLED ?? null)) {
    return NextResponse.json(buildEmptyFeed());
  }

  const feedUrl = process.env.NOTIFICATIONS_FEED_URL ?? process.env.NOTIFICATIONS_API_URL;

  if (!feedUrl) {
    return NextResponse.json(buildEmptyFeed());
  }

  try {
    return NextResponse.json(await fetchNotificationsFeed(request, feedUrl));
  } catch (error) {
    console.error('GET /api/notifications failed:', error);
    return NextResponse.json(buildEmptyFeed());
  }
}