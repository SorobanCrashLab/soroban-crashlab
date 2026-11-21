'use client';

import { useTranslations } from '../i18n/context';
import { SUPPORTED_LOCALES, LOCALE_COOKIE_NAME, LOCALE_COOKIE_MAX_AGE, type Locale } from '../i18n/config';
import { useState, useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  'en-XA': 'Pseudo (Test)',
};

const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  'en-XA': '🧪',
};

export function LocaleSwitcher() {
  const { locale, setLocale } = useTranslations();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dropdownRef, buttonRef, dropdownOpen, () => setDropdownOpen(false));

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleSelectLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    // Persist to cookie for server-side locale detection on next load
    document.cookie = `${LOCALE_COOKIE_NAME}=${newLocale}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/; samesite=lax`;
    setDropdownOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
        style={{
          background: 'var(--hover-bg)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
        }}
        aria-label="Change language"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <span className="text-sm">{LOCALE_FLAGS[locale]}</span>
        <span className="text-xs font-medium hidden sm:inline">{LOCALE_LABELS[locale]}</span>
        <svg
          className="w-3 h-3 transition-transform"
          style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdownOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-50"
          style={{
            background: 'var(--nav-bg)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div className="py-1">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                role="menuitem"
                onClick={() => handleSelectLocale(loc)}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors"
                style={{
                  background: locale === loc ? 'var(--hover-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--hover-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    locale === loc ? 'var(--hover-bg)' : 'transparent';
                }}
              >
                <span className="text-base">{LOCALE_FLAGS[loc]}</span>
                <span className="flex-1">{LOCALE_LABELS[loc]}</span>
                {locale === loc && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
