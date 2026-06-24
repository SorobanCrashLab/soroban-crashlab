'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useMaintainerMode } from '../useMaintainerMode';
import { loadFromStorage } from './api/api-config-utils';

export default function SettingsPage() {
  const { isMaintainer, toggle: toggleMaintainer, mounted, storageError } = useMaintainerMode();
  const [apiUrl, setApiUrl] = useState<string>('');
  const [isMockData, setIsMockData] = useState<boolean>(true);

  useEffect(() => {
    queueMicrotask(() => {
      const config = loadFromStorage();
      const activeUrl = config.backendUrl || process.env.NEXT_PUBLIC_API_URL || '';
      setApiUrl(activeUrl || 'Not configured (using mock data)');
      setIsMockData(!activeUrl);
    });
  }, []);
  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <h1 className="heading-page">Settings</h1>
        <p className="text-meta mt-0.5 sm:mt-1">System configuration and preferences</p>
      </div>

      {storageError && (
        <div className="mb-4 sm:mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Storage quota exceeded</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Your browser&apos;s local storage is full. Settings may not persist between sessions. Please clear some data or free up storage space.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { href: '/settings/alerting', title: 'Alerting', desc: 'Configure notification presets and alert thresholds', icon: '◉' },
          { href: '/settings/reporting', title: 'Reporting', desc: 'Report generation templates and export preferences', icon: '⊞' },
          { href: '/settings/accessibility', title: 'Accessibility', desc: 'Keyboard navigation, screen reader and contrast settings', icon: '◈' },
          { href: '/settings/api', title: 'API Configuration', desc: 'Backend URL, rate limits and connection settings', icon: '⚙' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card card-padding card-interactive flex items-start gap-3 sm:gap-4 text-decoration-none">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-lg flex-shrink-0" style={{ background: '#E7F0F9', color: '#0A66C2' }}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
              <p className="text-meta mt-0.5 text-xs sm:text-sm">{item.desc}</p>
            </div>
            <span className="text-meta shrink-0">→</span>
          </Link>
        ))}
      </div>

        <div className="card card-padding">
          <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Current Configuration</h3>
          <div className="space-y-3">
            {[
              { label: 'API URL', value: apiUrl },
              { label: 'Environment', value: process.env.NEXT_PUBLIC_VERCEL_ENV || 'Development' },
              { label: 'Mock Data', value: isMockData ? 'Enabled' : 'Disabled', color: isMockData ? '#057642' : '#CC1016' },
            ].map((info) => (
              <div key={info.label} className="flex justify-between items-center py-1">
                <span className="text-meta">{info.label}</span>
                <span className="text-sm font-medium" style={{ color: info.color || 'var(--text-primary)' }}>{info.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-padding">
          <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Maintainer Mode</h3>
          <p className="text-meta text-sm mb-4">
            Enable advanced tools and insights for project maintainers, including cross-run analytics,
            custom widgets, alert configuration, and resource fee analysis.
          </p>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Maintainer Mode</span>
              <p className="text-meta text-xs mt-0.5">
                {mounted && isMaintainer ? 'Currently active' : 'Currently disabled'}
              </p>
            </div>
            {mounted && (
              <button
                onClick={toggleMaintainer}
                className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:ring-offset-2"
                style={{
                  background: isMaintainer ? '#0A66C2' : '#E0DFDC',
                }}
                role="switch"
                aria-checked={isMaintainer}
                aria-label="Toggle maintainer mode"
              >
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm"
                  style={{ transform: isMaintainer ? 'translateX(24px)' : 'translateX(3px)' }}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
