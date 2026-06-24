'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { useMaintainerMode } from '../app/useMaintainerMode';
import NotificationCenter from '../app/add-notification-center-ui';

const allNavItems = [
  { href: '/', label: 'Dashboard', icon: '◉' },
  { href: '/runs', label: 'Runs', icon: '⊞' },
  { href: '/analytics', label: 'Analytics', icon: '⊟' },
  { href: '/triage', label: 'Triage', icon: '⚠' },
  { href: '/logs', label: 'Logs', icon: '☰' },
  { href: '/integrations', label: 'Integrations', icon: '⊕' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
  { href: '/maintainer', label: 'Maintainer', icon: '⚑' },
];

export default function NavBar() {
  const pathname = usePathname();
  const { theme, toggle, mounted } = useTheme();
  const { isMaintainer, mounted: mmMounted } = useMaintainerMode();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const showMaintainer = mmMounted && isMaintainer;
  const navItems = showMaintainer ? allNavItems : allNavItems.filter(i => i.href !== '/maintainer');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    queueMicrotask(() => setDrawerOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 h-[52px] flex items-center px-3 sm:px-4 border-b"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--border-color)',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
        }}
      >
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center"
            style={{ background: '#0A66C2' }}
          >
            <span className="text-white font-bold text-xs sm:text-sm">SC</span>
          </div>
          <span
            className="font-bold text-base sm:text-lg hidden xs:inline"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
          >
            CrashLab
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center h-full gap-1 flex-1 overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="top-nav-link shrink-0"
              style={{
                color: isActive(item.href) ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottomColor: isActive(item.href) ? 'var(--text-primary)' : 'transparent',
              }}
            >
              <span className="top-nav-icon text-sm">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
          {/* Notification bell */}
          <NotificationCenter />

          {/* Search - hidden on small mobile */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: mounted ? (theme === 'dark' ? '#1a1a1a' : '#EEF3F8') : 'var(--hover-bg)' }}
          >
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🔍</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Search runs...</span>
          </div>

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={toggle}
              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all"
              style={{
                background: theme === 'dark' ? '#1a1a1a' : '#F4F2EE',
                color: theme === 'dark' ? '#e0e0e0' : '#191919',
                border: '1px solid var(--border-color)',
              }}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          )}

          {/* Hamburger - mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex md:hidden items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
            aria-label="Open navigation menu"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Drawer overlay */}
      <div
        className={`drawer-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer */}
      <div ref={drawerRef} className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#0A66C2' }}>
              <span className="text-white font-bold text-xs">SC</span>
            </div>
            <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>CrashLab</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close navigation menu"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`drawer-item ${isActive(item.href) ? 'active' : ''}`}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="text-sm w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          <div className="divider mx-4 my-2" />

          {mounted && (
            <button
              onClick={toggle}
              className="drawer-item w-full text-left"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <span className="text-sm w-5 text-center">
                {theme === 'dark' ? '☀' : '☾'}
              </span>
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
