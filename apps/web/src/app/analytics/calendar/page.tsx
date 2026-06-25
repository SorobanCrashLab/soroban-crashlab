'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FuzzingRun } from '../../types';

type DayData = {
  date: string;
  count: number;
  failed: number;
  areas: Set<string>;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getColorClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-zinc-100 dark:bg-zinc-800';
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 'bg-blue-200 dark:bg-blue-900';
  if (ratio <= 0.5) return 'bg-blue-400 dark:bg-blue-700';
  if (ratio <= 0.75) return 'bg-blue-600 dark:bg-blue-500';
  return 'bg-blue-800 dark:bg-blue-400';
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function buildCalendarData(runs: FuzzingRun[]): DayData[] {
  const dayMap = new Map<string, DayData>();

  for (const run of runs) {
    const ts = run.finishedAt || run.queuedAt || run.startedAt;
    if (!ts) continue;
    const date = ts.slice(0, 10);
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, count: 0, failed: 0, areas: new Set() });
    }
    const day = dayMap.get(date)!;
    day.count += 1;
    if (run.status === 'failed') day.failed += 1;
    day.areas.add(run.area);
  }

  return Array.from(dayMap.values());
}

type CalendarCell = {
  date: string;
  count: number;
  failed: number;
  areas: string;
};

function generateCalendarWeeks(data: DayData[], months: number = 4) {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const dayLookup = new Map(data.map((d) => [d.date, d]));
  const weeks: CalendarCell[][] = [];
  const monthMarkers: { index: number; label: string }[] = [];

  const current = new Date(startDate);
  let week: CalendarCell[] = [];
  let cellIndex = 0;
  let lastMonth = -1;

  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);
    const day = dayLookup.get(dateStr);

    if (current.getMonth() !== lastMonth) {
      monthMarkers.push({ index: cellIndex, label: MONTH_LABELS[current.getMonth()] });
      lastMonth = current.getMonth();
    }

    week.push({
      date: dateStr,
      count: day?.count ?? 0,
      failed: day?.failed ?? 0,
      areas: day ? Array.from(day.areas).join(', ') : '',
    });

    if (current.getDay() === 6) {
      weeks.push(week);
      week = [];
    }

    cellIndex++;
    current.setDate(current.getDate() + 1);
  }

  if (week.length > 0) {
    while (week.length < 7) {
      const d = new Date(current);
      week.push({
        date: d.toISOString().slice(0, 10),
        count: 0,
        failed: 0,
        areas: '',
      });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return { weeks, monthMarkers, totalDays: cellIndex };
}

function generateMockCalendarRuns(): FuzzingRun[] {
  const runs: FuzzingRun[] = [];
  const areas: Array<FuzzingRun['area']> = ['auth', 'state', 'budget', 'xdr'];
  const severities: Array<FuzzingRun['severity']> = ['low', 'medium', 'high', 'critical'];
  const statuses: Array<FuzzingRun['status']> = ['completed', 'failed', 'completed', 'completed', 'failed'];

  const today = new Date();
  let runId = 2000;

  for (let dayOffset = 0; dayOffset < 120; dayOffset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - dayOffset);

    const runsOnDay = Math.random() < 0.3 ? Math.floor(Math.random() * 5) + 1 : 0;

    for (let i = 0; i < runsOnDay; i++) {
      const areaIdx = Math.floor(Math.random() * areas.length);
      const sevIdx = Math.floor(Math.random() * severities.length);
      const statusIdx = Math.floor(Math.random() * statuses.length);
      const status = statuses[statusIdx];
      const hour = 8 + Math.floor(Math.random() * 10);
      const minute = Math.floor(Math.random() * 60);

      d.setHours(hour, minute, 0, 0);
      const startedAt = d.toISOString();
      const duration = 60_000 + Math.floor(Math.random() * 300_000);
      const finishedAt = new Date(d.getTime() + duration).toISOString();

      runs.push({
        id: `run-${runId++}`,
        status,
        area: areas[areaIdx],
        severity: severities[sevIdx],
        duration,
        seedCount: 5000 + Math.floor(Math.random() * 50000),
        cpuInstructions: 200_000 + Math.floor(Math.random() * 2_000_000),
        memoryBytes: 500_000 + Math.floor(Math.random() * 5_000_000),
        minResourceFee: 400 + Math.floor(Math.random() * 2000),
        queuedAt: new Date(d.getTime() - 60_000).toISOString(),
        startedAt,
        finishedAt: status === 'running' ? undefined : finishedAt,
        crashDetail: status === 'failed' ? {
          failureCategory: ['InvariantViolation', 'Panic', 'BudgetExceeded'][Math.floor(Math.random() * 3)],
          signature: `sig:${['token', 'vault', 'router'][Math.floor(Math.random() * 3)]}:${['transfer', 'rebalance', 'swap'][Math.floor(Math.random() * 3)]}`,
          payload: '{"mock": true}',
          replayAction: 'cargo run --bin crash-replay -- --mock',
        } : null,
      });
    }
  }

  return runs;
}

export default function CalendarPage() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<'loading' | 'error' | 'success'>('loading');
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    count: number;
    failed: number;
    areas: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/runs')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          const apiRuns: FuzzingRun[] = data.runs ?? [];
          if (apiRuns.length > 0) {
            setRuns(apiRuns);
          } else {
            setRuns(generateMockCalendarRuns());
          }
          setDataState('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuns(generateMockCalendarRuns());
          setDataState('success');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const { calendarData, weeks, monthMarkers, maxCount } = useMemo(() => {
    const calendarData = buildCalendarData(runs);
    const maxCount = Math.max(1, ...calendarData.map((d) => d.count));
    const weeks = generateCalendarWeeks(calendarData, 4);
    return { calendarData, weeks: weeks.weeks, monthMarkers: weeks.monthMarkers, maxCount };
  }, [runs]);

  const stats = useMemo(() => {
    const activeDays = calendarData.filter((d) => d.count > 0);
    return {
      totalDays: activeDays.length,
      totalRuns: calendarData.reduce((s, d) => s + d.count, 0),
      totalFailed: calendarData.reduce((s, d) => s + d.failed, 0),
      avgPerDay: calendarData.length > 0
        ? (calendarData.reduce((s, d) => s + d.count, 0) / calendarData.length).toFixed(1)
        : '0',
      bestDay: activeDays.length > 0
        ? activeDays.reduce((a, b) => (a.count > b.count ? a : b))
        : null,
    };
  }, [calendarData]);

  const handleMouseEnter = (day: CalendarCell, e: React.MouseEvent) => {
    setHoveredDay(day);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-4 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Run Heatmap Calendar
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl">
            Visualize run activity over time. Each cell represents a day, color-coded by the number of
            fuzzing runs executed that day. Darker cells indicate higher run volume.
          </p>
        </div>

        {dataState === 'loading' && (
          <div className="card card-padding flex items-center justify-center py-16">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#0A66C2', borderTopColor: 'transparent' }} />
              <span className="text-meta">Loading run data...</span>
            </div>
          </div>
        )}

        {dataState === 'success' && (
          <>
            <div className="mb-6 grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card card-padding min-w-0 overflow-hidden">
                <p className="stat-value text-lg sm:text-xl leading-tight break-all">{stats.totalRuns}</p>
                <p className="text-meta wrap-break-word leading-snug">Total runs</p>
              </div>
              <div className="card card-padding min-w-0 overflow-hidden">
                <p className="stat-value text-lg sm:text-xl leading-tight break-all">{stats.totalDays}</p>
                <p className="text-meta wrap-break-word leading-snug">Active days</p>
              </div>
              <div className="card card-padding min-w-0 overflow-hidden">
                <p className="stat-value text-lg sm:text-xl leading-tight break-all">{stats.totalFailed}</p>
                <p className="text-meta wrap-break-word leading-snug">Failed runs</p>
              </div>
              <div className="card card-padding min-w-0 overflow-hidden">
                <p className="stat-value text-lg sm:text-xl leading-tight break-all">{stats.avgPerDay}</p>
                <p className="text-meta wrap-break-word leading-snug">Avg runs / day</p>
              </div>
            </div>

            <div className="card card-padding overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="flex text-xs text-zinc-400 dark:text-zinc-500 mb-1 ml-8" style={{ gap: '0' }}>
                  {monthMarkers.map((m, i) => {
                    const markerPos = m.index;
                    const nextMarkerIdx = monthMarkers[i + 1];
                    const span = nextMarkerIdx
                      ? (nextMarkerIdx.index - markerPos)
                      : (weeks.reduce((s, w) => s + w.length, 0) - markerPos);
                    return (
                      <div
                        key={m.label}
                        style={{ width: `${span * 16}px`, minWidth: `${span * 16}px` }}
                        className="text-[11px] font-medium"
                      >
                        {m.label}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-[3px]">
                  <div className="flex flex-col gap-[3px] mr-1 pt-0">
                    {[1, 3, 5].map((d) => (
                      <div key={d} className="h-[14px] text-[10px] text-zinc-400 dark:text-zinc-500 leading-[14px]">
                        {DAY_LABELS[d]}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-[3px]">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day) => (
                          <div
                            key={day.date}
                            onMouseEnter={(e) => {
                              if (day.count > 0) handleMouseEnter(day, e);
                              else setHoveredDay(null);
                            }}
                            onMouseMove={(e) => {
                              if (day.count > 0) setTooltipPos({ x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`w-[14px] h-[14px] rounded-sm cursor-pointer transition-colors ${getColorClass(day.count, maxCount)}`}
                            title={day.count > 0 ? `${day.date}: ${day.count} runs` : day.date}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <div
                      key={ratio}
                      className={`w-[14px] h-[14px] rounded-sm ${getColorClass(Math.ceil(ratio * maxCount), maxCount)}`}
                    />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>

            {hoveredDay && (
              <div
                className="fixed z-50 pointer-events-none bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 rounded-lg shadow-lg text-xs"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10 }}
              >
                <p className="font-semibold">{formatTooltipDate(hoveredDay.date)}</p>
                <p>{hoveredDay.count} run{hoveredDay.count !== 1 ? 's' : ''}</p>
                {hoveredDay.failed > 0 && (
                  <p className="text-red-300 dark:text-red-600">{hoveredDay.failed} failed</p>
                )}
                {hoveredDay.areas.length > 0 && (
                  <p>Areas: {hoveredDay.areas}</p>
                )}
              </div>
            )}

            {stats.bestDay && (
              <div className="mt-6 card card-padding">
                <h3 className="font-semibold text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                  Busiest Day
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatTooltipDate(stats.bestDay.date)}
                  </span>
                  {' — '}{stats.bestDay.count} runs ({stats.bestDay.failed} failed)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
