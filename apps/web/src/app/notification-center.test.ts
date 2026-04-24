/**
 * Tests for Notification Center core logic.
 * Covers: filtering, mark-as-read, dismiss, timestamp formatting, and edge cases.
 */
import * as assert from 'node:assert/strict';

// ── Types (mirrored from component) ──────────────────────────────────────────

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

interface Notification {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    dismissible?: boolean;
    runId?: string;
}

// ── Pure helpers (mirrored from component) ────────────────────────────────────

function filterNotifications(
    notifications: Notification[],
    filter: 'all' | 'unread',
): Notification[] {
    return filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
}

function markAsRead(notifications: Notification[], id: string): Notification[] {
    return notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
}

function markAllAsRead(notifications: Notification[]): Notification[] {
    return notifications.map((n) => ({ ...n, read: true }));
}

function dismissNotification(notifications: Notification[], id: string): Notification[] {
    return notifications.filter((n) => n.id !== id);
}

function formatTimestamp(timestamp: Date, now: Date): string {
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: `notif-${Math.random().toString(16).slice(2)}`,
    type: 'info',
    priority: 'low',
    title: 'Test Notification',
    message: 'Test message',
    timestamp: new Date(),
    read: false,
    dismissible: true,
    ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. filterNotifications — 'all' returns everything
{
    const notifications = [
        makeNotification({ read: true }),
        makeNotification({ read: false }),
        makeNotification({ read: true }),
    ];
    assert.equal(filterNotifications(notifications, 'all').length, 3);
}

// 2. filterNotifications — 'unread' returns only unread
{
    const notifications = [
        makeNotification({ id: 'a', read: false }),
        makeNotification({ id: 'b', read: true }),
        makeNotification({ id: 'c', read: false }),
    ];
    const result = filterNotifications(notifications, 'unread');
    assert.equal(result.length, 2);
    assert.ok(result.every((n) => !n.read));
}

// 3. filterNotifications — 'unread' on all-read returns empty
{
    const notifications = [makeNotification({ read: true }), makeNotification({ read: true })];
    assert.equal(filterNotifications(notifications, 'unread').length, 0);
}

// 4. markAsRead — marks only the target notification
{
    const notifications = [
        makeNotification({ id: 'a', read: false }),
        makeNotification({ id: 'b', read: false }),
    ];
    const result = markAsRead(notifications, 'a');
    assert.ok(result.find((n) => n.id === 'a')?.read === true);
    assert.ok(result.find((n) => n.id === 'b')?.read === false);
}

// 5. markAllAsRead — marks all notifications as read
{
    const notifications = [
        makeNotification({ read: false }),
        makeNotification({ read: false }),
        makeNotification({ read: true }),
    ];
    const result = markAllAsRead(notifications);
    assert.ok(result.every((n) => n.read));
}

// 6. dismissNotification — removes the target notification
{
    const notifications = [
        makeNotification({ id: 'a' }),
        makeNotification({ id: 'b' }),
        makeNotification({ id: 'c' }),
    ];
    const result = dismissNotification(notifications, 'b');
    assert.equal(result.length, 2);
    assert.ok(!result.some((n) => n.id === 'b'));
}

// 7. dismissNotification — dismissing non-existent id leaves list unchanged
{
    const notifications = [makeNotification({ id: 'a' }), makeNotification({ id: 'b' })];
    const result = dismissNotification(notifications, 'z');
    assert.equal(result.length, 2);
}

// 8. formatTimestamp — just now (< 1 minute)
{
    const now = new Date();
    const ts = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    assert.equal(formatTimestamp(ts, now), 'Just now');
}

// 9. formatTimestamp — minutes ago
{
    const now = new Date();
    const ts = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
    assert.equal(formatTimestamp(ts, now), '15m ago');
}

// 10. formatTimestamp — hours ago
{
    const now = new Date();
    const ts = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
    assert.equal(formatTimestamp(ts, now), '3h ago');
}

// 11. formatTimestamp — days ago
{
    const now = new Date();
    const ts = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    assert.equal(formatTimestamp(ts, now), '2d ago');
}

// 12. Edge case: unread count after markAllAsRead
{
    const notifications = [
        makeNotification({ read: false }),
        makeNotification({ read: false }),
        makeNotification({ read: false }),
    ];
    const result = markAllAsRead(notifications);
    const unreadCount = result.filter((n) => !n.read).length;
    assert.equal(unreadCount, 0);
}

console.log('notification-center.test.ts: all assertions passed');
