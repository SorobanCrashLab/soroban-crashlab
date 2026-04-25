'use client';

import React, { useState, useEffect } from 'react';

interface SLATarget {
  event: string;
  timer: string;
  owner: string;
  escalation: string;
}

interface ActiveSLAItem {
  id: string;
  type: 'issue' | 'pr' | 'application';
  title: string;
  startTime: Date;
  limitHours: number;
  escalationHours: number;
  owner: string;
}

const SLA_TARGETS: SLATarget[] = [
  { event: 'New application received', timer: '24 h', owner: 'Wave maintainer', escalation: 'Wave lead at 36 h' },
  { event: 'Issue assigned — first update', timer: '24 h', owner: 'Assigned contributor', escalation: 'Un-assign + re-open at 48 h' },
  { event: 'PR submitted — first review', timer: '24 h', owner: 'Assigned reviewer', escalation: 'Any available maintainer at 36 h' },
  { event: 'PR review comment — response', timer: '48 h', owner: 'Assigned contributor', escalation: 'Stale label + ping at 60 h' },
  { event: 'Merge-blocked PR — resolved', timer: '24 h', owner: 'Blocking maintainer', escalation: 'Wave lead escalation at 36 h' },
  { event: 'New triage issue (unlabelled)', timer: '48 h', owner: 'Triage maintainer', escalation: 'Wave lead at 72 h' },
];

const MOCK_ACTIVE_ITEMS: ActiveSLAItem[] = [
  {
    id: 'PR-418',
    type: 'pr',
    title: 'Implement Deterministic Suite Ordering',
    startTime: new Date(Date.now() - 18 * 60 * 60 * 1000), // 18 hours ago
    limitHours: 24,
    escalationHours: 36,
    owner: '@maintainer-alpha'
  },
  {
    id: 'ISSUE-392',
    type: 'issue',
    title: 'Add Flash-Loan Reentrancy Guards',
    startTime: new Date(Date.now() - 42 * 60 * 60 * 1000), // 42 hours ago
    limitHours: 24,
    escalationHours: 48,
    owner: '@contributor-x'
  },
  {
    id: 'APP-92',
    type: 'application',
    title: 'Application from @new-dev',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    limitHours: 24,
    escalationHours: 36,
    owner: 'Unassigned'
  }
];

export default function ContributorSLATargets() {
  const [activeItems, setActiveItems] = useState<ActiveSLAItem[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setActiveItems(MOCK_ACTIVE_ITEMS);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getRemainingTime = (item: ActiveSLAItem) => {
    const elapsedMs = now.getTime() - item.startTime.getTime();
    const limitMs = item.limitHours * 3600 * 1000;
    const remainingMs = limitMs - elapsedMs;
    
    const isOverdue = remainingMs < 0;
    const absoluteMs = Math.abs(remainingMs);
    
    const hours = Math.floor(absoluteMs / (3600 * 1000));
    const minutes = Math.floor((absoluteMs % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((absoluteMs % (60 * 1000)) / 1000);
    
    return {
      text: `${isOverdue ? '+' : ''}${hours}h ${minutes}m ${seconds}s`,
      isOverdue,
      percentage: Math.min(100, (elapsedMs / limitMs) * 100)
    };
  };

  return (
    <section className="w-full space-y-12 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Contributor SLA Targets
          </h2>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Real-time tracking of Wave 3 response and review windows.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-700 dark:text-blue-300 text-sm font-medium border border-blue-100 dark:border-blue-800/50">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Live Monitoring Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Timers Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Active SLA Windows
            </h3>
            <span className="text-sm text-zinc-500">{activeItems.length} items tracked</span>
          </div>

          <div className="grid gap-4" role="list" aria-label="Active SLA windows">
            {activeItems.map((item) => {
              const { text, isOverdue, percentage } = getRemainingTime(item);
              return (
                <div 
                  key={item.id} 
                  role="listitem"
                  className={`group relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-lg ${
                    isOverdue 
                      ? 'bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900/50' 
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          item.type === 'pr' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                          item.type === 'issue' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        }`}>
                          {item.type}
                        </span>
                        <span className="text-sm font-mono font-medium text-zinc-500">{item.id}</span>
                      </div>
                      <h4 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Assigned to <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.owner}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-black font-mono tracking-tighter ${
                        isOverdue ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'
                      }`}>
                        {text}
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mt-1">
                        {isOverdue ? 'Breach Escalation' : 'Time Remaining'}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-6 h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                        isOverdue ? 'bg-red-500' : 
                        percentage > 80 ? 'bg-amber-500' : 
                        'bg-blue-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  
                  {isOverdue && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400 animate-pulse">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      SLA Breach Detected — Escalating to Wave Lead
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Targets Table Column */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            SLA Policy Targets
          </h3>
          
          <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {SLA_TARGETS.map((target, idx) => (
                <div key={idx} className="p-4 hover:bg-white dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{target.event}</span>
                    <span className="flex-shrink-0 px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded text-xs font-mono font-bold">
                      {target.timer}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Owner:</span> {target.owner}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Escalation:</span> {target.escalation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed uppercase font-bold tracking-tight">
                * Timers are wall-clock hours from the triggering event.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
