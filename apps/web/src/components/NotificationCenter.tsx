/**
 * Notification Center component (issue #2262).
 * Bell icon with badge + dropdown panel.
 */

'use client';

import { useState, useRef } from 'react';
import { useNotifications } from '@/lib/store/notificationStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { formatRelativeSafe } from '@/i18n/formatting';
import { useTranslations } from '@/i18n/context';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { locale, mounted } = useTranslations();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dropdownRef, buttonRef, dropdownOpen, () => setDropdownOpen(false));

  const handleMarkRead = (id: string) => {
    markAsRead(id);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all"
        style={{
          background: 'var(--hover-bg)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={dropdownOpen}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full"
            style={{
              background: 'var(--error-color, #ef4444)',
              color: 'white',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg shadow-lg z-50"
          style={{
            background: 'var(--nav-bg)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div className="sticky top-0 flex items-center justify-between p-3 border-b"
            style={{ borderColor: 'var(--border-color)', background: 'var(--nav-bg)' }}
          >
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--text-secondary)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {notifications.length === 0 ? (
              <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((notification) => (
                <div
                  key={notification.id}
                  className="p-3 hover:bg-opacity-50 cursor-pointer"
                  style={{
                    background: notification.state === 'unread' ? 'var(--hover-bg)' : 'transparent',
                  }}
                  onClick={() => handleMarkRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {notification.title}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {notification.message}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}>
                        {formatRelativeSafe(notification.timestamp, locale, mounted)}
                      </p>
                    </div>
                    {notification.state === 'unread' && (
                      <div
                        className="w-2 h-2 rounded-full mt-1"
                        style={{ background: 'var(--primary-color, #3b82f6)' }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
