'use client';

import React, { useState, useMemo } from 'react';
import type { MilestoneEvent } from './campaign-milestone-timeline-utils';

interface CampaignMilestoneTimelineVisualizerProps {
  /** Array of milestone events to visualize */
  events: MilestoneEvent[];
  /** Optional title for the timeline */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Maximum events to display (paginated) */
  maxEventsPerPage?: number;
  /** Filter events by type */
  filterByType?: MilestoneEvent['type'][];
  /** Filter events by severity */
  filterBySeverity?: Array<'low' | 'medium' | 'high' | 'critical'>;
  /** Show event details on hover */
  showDetails?: boolean;
}

export default function CampaignMilestoneTimelineVisualizer({
  events,
  title = 'Campaign Milestone Timeline',
  subtitle = 'Track key events and failures throughout your fuzzing campaign',
  maxEventsPerPage = 20,
  filterByType,
  filterBySeverity,
  showDetails = true,
}: CampaignMilestoneTimelineVisualizerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterByType && !filterByType.includes(event.type)) {
        return false;
      }
      if (filterBySeverity && event.severity && !filterBySeverity.includes(event.severity)) {
        return false;
      }
      return true;
    });
  }, [events, filterByType, filterBySeverity]);

  // Paginate events
  const totalPages = Math.ceil(filteredEvents.length / maxEventsPerPage);
  const startIdx = (currentPage - 1) * maxEventsPerPage;
  const paginatedEvents = filteredEvents.slice(startIdx, startIdx + maxEventsPerPage);

  const getEventIcon = (type: MilestoneEvent['type']) => {
    switch (type) {
      case 'campaign_start':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'campaign_pause':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        );
      case 'campaign_resume':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 12.707a1 1 0 010-1.414L10 7.586l4.707 4.707a1 1 0 111.414-1.414l-5-5a1 1 0 00-1.414 0l-5 5a1 1 0 001.414 1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'failure_discovered':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'run_update':
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v2h16V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getSeverityColor = (severity?: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/20 border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300';
      case 'medium':
        return 'bg-amber-100 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300';
      case 'low':
      default:
        return 'bg-blue-100 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300';
    }
  };

  const getTypeLabel = (type: MilestoneEvent['type']): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{filteredEvents.length}</p>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Events</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6">
        {paginatedEvents.length === 0 ? (
          <div className="py-12 text-center">
            <svg className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">No events to display</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-600 mt-1">Start a campaign to see milestone events</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedEvents.map((event, index) => (
              <div
                key={event.id}
                className={`flex gap-4 p-4 rounded-lg border transition-all ${getSeverityColor(
                  event.severity
                )} cursor-pointer hover:shadow-md`}
                onClick={() =>
                  setExpandedEventId(expandedEventId === event.id ? null : event.id)
                }
              >
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className="p-2 rounded-full bg-white dark:bg-zinc-900 border-2 border-current">
                    {getEventIcon(event.type)}
                  </div>
                  {index < paginatedEvents.length - 1 && (
                    <div className="w-0.5 h-12 bg-current opacity-30 mt-2" />
                  )}
                </div>

                {/* Event details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm">{event.label}</h3>
                      <p className="text-xs opacity-75 mt-0.5">{getTypeLabel(event.type)}</p>
                    </div>
                    <span className="text-xs font-semibold opacity-70 flex-shrink-0 ml-2">
                      {event.timestamp}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm mt-2 opacity-85 leading-relaxed">{event.description}</p>

                  {/* Expandable details */}
                  {showDetails && expandedEventId === event.id && (
                    <div className="mt-3 pt-3 border-t border-current opacity-60 space-y-1 text-xs">
                      {event.runId && (
                        <div>
                          <span className="font-semibold">Run ID:</span> <code className="font-mono">{event.runId}</code>
                        </div>
                      )}
                      {event.failureSignature && (
                        <div>
                          <span className="font-semibold">Signature:</span> <code className="font-mono">{event.failureSignature}</code>
                        </div>
                      )}
                      {event.failureCount && (
                        <div>
                          <span className="font-semibold">Failure Count:</span> {event.failureCount}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
