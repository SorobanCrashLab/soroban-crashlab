'use client';

import { useEffect, useState, useCallback } from 'react';

type MilestoneEventType = 'campaign_start' | 'campaign_pause' | 'campaign_resume' | 'campaign_end' | 'failure_discovered';

interface MilestoneEvent {
  id: string;
  type: MilestoneEventType;
  timestamp: string;
  label: string;
  description: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  failureCount?: number;
}

interface CampaignMilestoneTimelineProps {
  campaignId?: string;
  autoUpdateInterval?: number;
  maxEventsDisplayed?: number;
}

export default function CampaignMilestoneTimeline({
  campaignId = 'campaign-001',
  autoUpdateInterval = 5000,
  maxEventsDisplayed = 10,
}: CampaignMilestoneTimelineProps) {
  const [events, setEvents] = useState<MilestoneEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isLive, setIsLive] = useState(true);

  // Simulate incremental event generation
  const generateNewEvent = useCallback((): MilestoneEvent | null => {
    const severities = ['critical', 'high', 'medium', 'low'] as const;
    
    // 60% chance of failure discovered, 20% pause, 20% resume
    const rand = Math.random();
    let type: MilestoneEventType;
    
    if (rand < 0.6) {
      type = 'failure_discovered';
    } else if (rand < 0.8) {
      type = 'campaign_pause';
    } else {
      type = 'campaign_resume';
    }

    const now = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });

    if (type === 'failure_discovered') {
      return {
        id: `event-${Date.now()}`,
        type,
        timestamp: now,
        label: 'Failure Discovered',
        description: `New crash signature detected in run batch`,
        severity: severities[Math.floor(Math.random() * severities.length)],
        failureCount: Math.floor(Math.random() * 10) + 1,
      };
    } else if (type === 'campaign_pause') {
      return {
        id: `event-${Date.now()}`,
        type,
        timestamp: now,
        label: 'Campaign Paused',
        description: 'Campaign execution paused by user',
        severity: 'medium',
      };
    } else {
      return {
        id: `event-${Date.now()}`,
        type,
        timestamp: now,
        label: 'Campaign Resumed',
        description: 'Campaign execution resumed',
        severity: 'low',
      };
    }
  }, []);

  // Initialize with campaign start event
  useEffect(() => {
    const startEvent: MilestoneEvent = {
      id: `event-${campaignId}-start`,
      type: 'campaign_start',
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }),
      label: 'Campaign Started',
      description: `Fuzzing campaign ${campaignId} initiated`,
      severity: 'low',
    };
    const timer = setTimeout(() => setEvents([startEvent]), 0);
    return () => clearTimeout(timer);
  }, [campaignId]);

  // Simulate incremental event updates
  useEffect(() => {
    if (isPaused || !isLive) return;

    const interval = setInterval(() => {
      const newEvent = generateNewEvent();
      if (newEvent) {
        setEvents((prev) => {
          const updated = [newEvent, ...prev];
          return updated.slice(0, maxEventsDisplayed);
        });
      }
    }, autoUpdateInterval);

    return () => clearInterval(interval);
  }, [isPaused, isLive, generateNewEvent, autoUpdateInterval, maxEventsDisplayed]);

  const getSeverityColor = (severity?: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700';
      case 'low':
      default:
        return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700';
    }
  };

  const getEventIcon = (type: MilestoneEventType): string => {
    switch (type) {
      case 'campaign_start':
        return '▶';
      case 'campaign_pause':
        return '⏸';
      case 'campaign_resume':
        return '▶';
      case 'campaign_end':
        return '⏹';
      case 'failure_discovered':
        return '⚠';
      default:
        return '●';
    }
  };

  const getEventIconBg = (type: MilestoneEventType): string => {
    switch (type) {
      case 'campaign_start':
        return 'bg-green-600 dark:bg-green-500';
      case 'campaign_pause':
        return 'bg-yellow-600 dark:bg-yellow-500';
      case 'campaign_resume':
        return 'bg-green-600 dark:bg-green-500';
      case 'campaign_end':
        return 'bg-gray-600 dark:bg-gray-500';
      case 'failure_discovered':
        return 'bg-red-600 dark:bg-red-500';
      default:
        return 'bg-blue-600 dark:bg-blue-500';
    }
  };

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full font-sans">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Campaign Milestones
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              isPaused
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
            }`}
          >
            {isPaused ? '⏸ Paused' : '▶ Live'}
          </button>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              isLive
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
            }`}
          >
            {isLive ? '🔴 Live' : '⚪ Offline'}
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-center text-zinc-500 dark:text-zinc-400 py-8">
            Waiting for campaign events...
          </p>
        ) : (
          events.map((event, idx) => (
            <div
              key={event.id}
              className={`border-l-4 rounded-lg p-4 transition-all duration-300 ease-in-out ${getSeverityColor(
                event.severity,
              )} ${idx === 0 ? 'opacity-100 shadow-md' : 'opacity-90'}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full ${getEventIconBg(
                    event.type,
                  )} text-white flex items-center justify-center font-bold text-sm`}
                >
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {event.label}
                    </h3>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                      {event.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                    {event.description}
                  </p>
                  {event.failureCount !== undefined && (
                    <div className="flex gap-2">
                      <span className="inline-block px-2 py-1 bg-white dark:bg-zinc-900 rounded text-xs font-mono text-zinc-600 dark:text-zinc-300">
                        {event.failureCount} new signature{event.failureCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {events.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Showing {Math.min(events.length, maxEventsDisplayed)} of {events.length} events</span>
          <div className="flex gap-2">
            {isPaused && <span className="text-yellow-600 dark:text-yellow-400">⏸ Updates paused</span>}
            {isLive && !isPaused && (
              <span className="text-green-600 dark:text-green-400 animate-pulse">● Live updates</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
