"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMaintainerMode } from "../useMaintainerMode";

interface DashboardShellProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
}

export default function DashboardShell({
  children,
  title,
  subtitle,
  headerActions,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isMaintainer, toggle: toggleMaintainer } = useMaintainerMode();
  const [currentTime, setCurrentTime] = useState("");

  // Update clock for dynamic visual feel — defer via timeout to satisfy
  // react-hooks/set-state-in-effect (no synchronous setState inside body).
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tick = window.setTimeout(() => setCurrentTime(fmt()), 0);
    const timer = setInterval(() => setCurrentTime(fmt()), 60000);
    return () => {
      window.clearTimeout(tick);
      clearInterval(timer);
    };
  }, []);

  const navigationItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      name: "Triage Board",
      href: "/triage",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      name: "Logs Explorer",
      href: "/logs",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: "Alert Rules",
      href: "/settings/alerting",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      name: "Keyboard Nav",
      href: "/settings/accessibility",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
      ),
    },
  ];

  const secondaryNavigation = [
    {
      name: "Documentation",
      href: "https://github.com/SorobanCrashLab/soroban-crashlab#readme",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: "GitHub Repository",
      href: "https://github.com/SorobanCrashLab/soroban-crashlab",
      icon: (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      ),
    },
  ];

  const getBreadcrumb = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname === "/triage") return "Triage Board";
    if (pathname === "/logs") return "Logs Explorer";
    if (pathname === "/settings/alerting") return "Alert Rules";
    if (pathname === "/settings/accessibility") return "Keyboard Navigation";
    return pathname?.split("/").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" / ") || "Dashboard";
  };

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
      
      {/* Sidebar for Desktop */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-zinc-200/60 dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md transition-all duration-300 ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0 font-bold shadow-lg shadow-blue-500/20">
              CL
            </div>
            {!isSidebarCollapsed && (
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-700 dark:from-zinc-100 dark:to-zinc-300 bg-clip-text text-transparent truncate">
                CrashLab
              </span>
            )}
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-l-4 border-blue-600"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/50 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
                title={isSidebarCollapsed ? item.name : undefined}
              >
                <span className={`shrink-0 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"}`}>
                  {item.icon}
                </span>
                {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}

          <div className="my-6 border-t border-zinc-200/50 dark:border-zinc-800/50" />

          {/* Secondary Links */}
          {secondaryNavigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors group"
              title={isSidebarCollapsed ? item.name : undefined}
            >
              <span className="shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                {item.icon}
              </span>
              {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
            </a>
          ))}
        </nav>

        {/* Fuzzer Status & Collapse Action */}
        <div className="p-4 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-4">
          {!isSidebarCollapsed && (
            <div className="rounded-xl bg-zinc-100/70 dark:bg-zinc-800/40 p-3 border border-zinc-200/40 dark:border-zinc-700/20 text-xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Fuzzer Online</span>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 leading-normal">
                Continuous invariant analysis is active.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all border border-zinc-200/40 dark:border-zinc-800/40"
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`h-5 w-5 transition-transform duration-300 ${isSidebarCollapsed ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content Layout Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Navigation / Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
          
          {/* Mobile Menu trigger & Breadcrumb */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              aria-label="Toggle mobile menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>

            {/* Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span>CrashLab</span>
              <svg className="h-3 w-3 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-zinc-600 dark:text-zinc-300">{getBreadcrumb()}</span>
            </div>
          </div>

          {/* Header Action Elements */}
          <div className="flex items-center gap-4">
            {/* Search Shortcut */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-500 dark:text-zinc-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search runs...</span>
              <kbd className="font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded text-[10px]">⌘K</kbd>
            </div>

            {/* Role / Maintainer Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMaintainer}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 ${
                  isMaintainer
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200/50 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700/50"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isMaintainer ? "bg-amber-500 animate-pulse" : "bg-zinc-500 dark:bg-zinc-400"}`} />
                <span>{isMaintainer ? "Maintainer" : "User"} Mode</span>
              </button>
            </div>

            {/* Time Indicator */}
            {currentTime && (
              <div className="hidden lg:block text-xs font-medium text-zinc-500">
                {currentTime}
              </div>
            )}
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/45 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <nav className="relative flex flex-col w-4/5 max-w-sm bg-white dark:bg-zinc-900 h-full p-6 shadow-2xl border-r border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-8">
                <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Soroban CrashLab
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                  aria-label="Close mobile menu"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 space-y-2">
                {navigationItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile Drawer Footer Status */}
              <div className="mt-auto border-t border-zinc-200/60 dark:border-zinc-800/60 pt-6">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Fuzzer active on Stellar Horizon</span>
                </div>
              </div>
            </nav>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
            
            {/* Optional Header Component Banner */}
            {(title || subtitle || headerActions) && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-zinc-200/50 dark:border-zinc-800/50">
                <div className="space-y-1">
                  {title && (
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {subtitle}
                    </p>
                  )}
                </div>
                {headerActions && (
                  <div className="flex items-center gap-3">
                    {headerActions}
                  </div>
                )}
              </div>
            )}

            {/* Injected Content */}
            <div className="w-full">
              {children}
            </div>

            {/* Dashboard Layout Footer */}
            <footer className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-8 mt-12 text-center text-xs text-zinc-500 leading-normal">
              <p>Soroban CrashLab &middot; Stellar &amp; Soroban smart contract invariant mutation framework</p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">Continuous fuzzing node &middot; Version 0.1.0 (Stellar Wave 3 Release)</p>
            </footer>

          </div>
        </main>
      </div>

    </div>
  );
}
