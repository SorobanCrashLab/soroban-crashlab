'use client';

import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { FuzzingRun, RunArea, RunSeverity } from './types';

interface ResourceFeeInsightPanelProps {
  runs: FuzzingRun[];
  className?: string;
}

interface ResourceFeeStats {
  totalRuns: number;
  averageFee: number;
  minFee: number;
  maxFee: number;
  medianFee: number;
  totalFees: number;
  feeDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  areaBreakdown: {
    [key in RunArea]: {
      averageFee: number;
      totalRuns: number;
      totalFees: number;
    };
  };
  severityBreakdown: {
    [key in RunSeverity]: {
      averageFee: number;
      totalRuns: number;
      totalFees: number;
    };
  };
  trends: {
    daily: Array<{ date: string; averageFee: number; runCount: number }>;
    weekly: Array<{ week: string; averageFee: number; runCount: number }>;
  };
}

function calculateGroupStats(groupRuns: FuzzingRun[]) {
  const fees = groupRuns.map(run => run.minResourceFee).filter(fee => fee > 0);
  return {
    averageFee: fees.length > 0 ? fees.reduce((sum, fee) => sum + fee, 0) / fees.length : 0,
    totalRuns: groupRuns.length,
    totalFees: fees.reduce((sum, fee) => sum + fee, 0)
  };
}

function getWeekString(date: Date) {
  const year = date.getFullYear();
  const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function calculateTrends(filteredRuns: FuzzingRun[]) {
  const dailyData = new Map<string, { fees: number[]; count: number }>();
  const weeklyData = new Map<string, { fees: number[]; count: number }>();

  filteredRuns.forEach(run => {
    const date = new Date(run.startedAt || run.queuedAt || '');
    const dateStr = date.toISOString().split('T')[0];
    const weekStr = getWeekString(date);

    if (!dailyData.has(dateStr)) {
      dailyData.set(dateStr, { fees: [], count: 0 });
    }
    if (!weeklyData.has(weekStr)) {
      weeklyData.set(weekStr, { fees: [], count: 0 });
    }

    if (run.minResourceFee > 0) {
      dailyData.get(dateStr)!.fees.push(run.minResourceFee);
      weeklyData.get(weekStr)!.fees.push(run.minResourceFee);
    }
    dailyData.get(dateStr)!.count++;
    weeklyData.get(weekStr)!.count++;
  });

  const daily = Array.from(dailyData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([date, data]) => ({
      date,
      averageFee: data.fees.length > 0 ? data.fees.reduce((sum, fee) => sum + fee, 0) / data.fees.length : 0,
      runCount: data.count
    }));

  const weekly = Array.from(weeklyData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week, data]) => ({
      week,
      averageFee: data.fees.length > 0 ? data.fees.reduce((sum, fee) => sum + fee, 0) / data.fees.length : 0,
      runCount: data.count
    }));

  return { daily, weekly };
}

const ResourceFeeInsightPanel: React.FC<ResourceFeeInsightPanelProps> = ({
  runs,
  className = '',
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [viewMode, setViewMode] = useState<'overview' | 'trends' | 'breakdown'>('overview');

  const calculateGroupStats = (groupRuns: FuzzingRun[]) => {
    const fees = groupRuns.map(run => run.minResourceFee).filter(fee => fee > 0);
    return {
      averageFee: fees.length > 0 ? fees.reduce((sum, fee) => sum + fee, 0) / fees.length : 0,
      totalRuns: groupRuns.length,
      totalFees: fees.reduce((sum, fee) => sum + fee, 0)
    };
  };

  const getWeekString = (date: Date) => {
    const year = date.getFullYear();
    const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week.toString().padStart(2, '0')}`;
  };

  const calculateTrends = useCallback((filteredRuns: FuzzingRun[]) => {
    const dailyData = new Map<string, { fees: number[]; count: number }>();
    const weeklyData = new Map<string, { fees: number[]; count: number }>();

    filteredRuns.forEach(run => {
      const date = new Date(run.startedAt || run.queuedAt || '');
      const dateStr = date.toISOString().split('T')[0];
      const weekStr = getWeekString(date);

      if (!dailyData.has(dateStr)) {
        dailyData.set(dateStr, { fees: [], count: 0 });
      }
      if (!weeklyData.has(weekStr)) {
        weeklyData.set(weekStr, { fees: [], count: 0 });
      }

      if (run.minResourceFee > 0) {
        dailyData.get(dateStr)!.fees.push(run.minResourceFee);
        weeklyData.get(weekStr)!.fees.push(run.minResourceFee);
      }
      dailyData.get(dateStr)!.count++;
      weeklyData.get(weekStr)!.count++;
    });

    const daily = Array.from(dailyData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, data]) => ({
        date,
        averageFee: data.fees.length > 0 ? data.fees.reduce((sum, fee) => sum + fee, 0) / data.fees.length : 0,
        runCount: data.count
      }));

    const weekly = Array.from(weeklyData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, data]) => ({
        week,
        averageFee: data.fees.length > 0 ? data.fees.reduce((sum, fee) => sum + fee, 0) / data.fees.length : 0,
        runCount: data.count
      }));

    return { daily, weekly };
  }, []);

  const calculateStats = useCallback((): ResourceFeeStats => {
    const filteredRuns = runs.filter(run => {
      if (timeRange === 'all') return true;
      const runDate = new Date(run.startedAt || run.queuedAt || '');
      const now = new Date();
      const daysDiff = (now.getTime() - runDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= parseInt(timeRange.replace('d', ''));
    });

    const fees = filteredRuns.map(run => run.minResourceFee).filter(fee => fee > 0);
    
    if (fees.length === 0) {
      return {
        totalRuns: 0,
        averageFee: 0,
        minFee: 0,
        maxFee: 0,
        medianFee: 0,
        totalFees: 0,
        feeDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        areaBreakdown: { auth: { averageFee: 0, totalRuns: 0, totalFees: 0 }, state: { averageFee: 0, totalRuns: 0, totalFees: 0 }, budget: { averageFee: 0, totalRuns: 0, totalFees: 0 }, xdr: { averageFee: 0, totalRuns: 0, totalFees: 0 } },
        severityBreakdown: { low: { averageFee: 0, totalRuns: 0, totalFees: 0 }, medium: { averageFee: 0, totalRuns: 0, totalFees: 0 }, high: { averageFee: 0, totalRuns: 0, totalFees: 0 }, critical: { averageFee: 0, totalRuns: 0, totalFees: 0 } },
        trends: { daily: [], weekly: [] }
      };
    }

    const sortedFees = [...fees].sort((a, b) => a - b);
    const medianFee = sortedFees.length % 2 === 0
      ? (sortedFees[sortedFees.length / 2 - 1] + sortedFees[sortedFees.length / 2]) / 2
      : sortedFees[Math.floor(sortedFees.length / 2)];

    const feeThresholds = {
      low: Math.min(...fees) + (sortedFees[Math.floor(fees.length * 0.25)] - Math.min(...fees)),
      medium: sortedFees[Math.floor(fees.length * 0.5)],
      high: sortedFees[Math.floor(fees.length * 0.75)]
    };

    const feeDistribution = {
      low: fees.filter(fee => fee <= feeThresholds.low).length,
      medium: fees.filter(fee => fee > feeThresholds.low && fee <= feeThresholds.medium).length,
      high: fees.filter(fee => fee > feeThresholds.medium && fee <= feeThresholds.high).length,
      critical: fees.filter(fee => fee > feeThresholds.high).length
    };

    const areaBreakdown = {
      auth: calculateGroupStats(filteredRuns.filter(run => run.area === 'auth')),
      state: calculateGroupStats(filteredRuns.filter(run => run.area === 'state')),
      budget: calculateGroupStats(filteredRuns.filter(run => run.area === 'budget')),
      xdr: calculateGroupStats(filteredRuns.filter(run => run.area === 'xdr'))
    };

    const severityBreakdown = {
      low: calculateGroupStats(filteredRuns.filter(run => run.severity === 'low')),
      medium: calculateGroupStats(filteredRuns.filter(run => run.severity === 'medium')),
      high: calculateGroupStats(filteredRuns.filter(run => run.severity === 'high')),
      critical: calculateGroupStats(filteredRuns.filter(run => run.severity === 'critical'))
    };

    const trends = calculateTrends(filteredRuns);

    return {
      totalRuns: filteredRuns.length,
      averageFee: fees.reduce((sum, fee) => sum + fee, 0) / fees.length,
      minFee: Math.min(...fees),
      maxFee: Math.max(...fees),
      medianFee,
      totalFees: fees.reduce((sum, fee) => sum + fee, 0),
      feeDistribution,
      areaBreakdown,
      severityBreakdown,
      trends
    };
  }, [runs, timeRange, calculateTrends]);

  const stats = useMemo(() => calculateStats(), [calculateStats]);

  const formatFee = (fee: number) => {
    return fee.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const getFeeColor = (fee: number, average: number) => {
    if (fee < average * 0.5) return 'text-green-600';
    if (fee < average * 1.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Average Fee</div>
          <div className="text-2xl font-bold text-gray-900">{formatFee(stats.averageFee)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Median Fee</div>
          <div className="text-2xl font-bold text-gray-900">{formatFee(stats.medianFee)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Min/Max</div>
          <div className="text-lg font-bold text-gray-900">
            {formatFee(stats.minFee)} / {formatFee(stats.maxFee)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total Fees</div>
          <div className="text-2xl font-bold text-gray-900">{formatFee(stats.totalFees)}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Fee Distribution</h4>
        <div className="space-y-2">
          {Object.entries(stats.feeDistribution).map(([level, count]) => {
            const percentage = stats.totalRuns > 0 ? (count / stats.totalRuns) * 100 : 0;
            const colors = {
              low: 'bg-green-500',
              medium: 'bg-yellow-500',
              high: 'bg-orange-500',
              critical: 'bg-red-500'
            };
            return (
              <div key={level} className="flex items-center gap-3">
                <div className="w-16 text-sm font-medium capitalize">{level}</div>
                <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                  <div
                    className={`h-6 rounded-full ${colors[level as keyof typeof colors]}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="w-20 text-sm text-right">{count} runs</div>
                <div className="w-12 text-sm text-right">{percentage.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderTrends = () => (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Daily Trends (Last 30 days)</h4>
        <div className="h-64 flex items-end justify-between gap-1">
          {stats.trends.daily.map((day) => {
            const maxFee = Math.max(...stats.trends.daily.map(d => d.averageFee));
            const height = maxFee > 0 ? (day.averageFee / maxFee) * 100 : 0;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${height}%`, minHeight: height > 0 ? '2px' : '0' }}
                  title={`${day.date}: ${formatFee(day.averageFee)} (${day.runCount} runs)`}
                />
                <div className="text-xs text-gray-500 mt-1 rotate-45 origin-left">
                  {new Date(day.date).getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Weekly Trends (Last 12 weeks)</h4>
        <div className="space-y-2">
          {stats.trends.weekly.map(week => (
            <div key={week.week} className="flex items-center gap-3">
              <div className="w-20 text-sm">{week.week}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                <div
                  className="h-4 bg-blue-500 rounded-full"
                  style={{
                    width: `${Math.max((week.averageFee / Math.max(...stats.trends.weekly.map(w => w.averageFee))) * 100, 2)}%`
                  }}
                />
              </div>
              <div className="w-24 text-sm text-right">{formatFee(week.averageFee)}</div>
              <div className="w-12 text-sm text-gray-500">{week.runCount}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBreakdown = () => (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">By Area</h4>
        <div className="space-y-3">
          {Object.entries(stats.areaBreakdown).map(([area, data]) => (
            <div key={area} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div>
                <div className="font-medium capitalize">{area}</div>
                <div className="text-sm text-gray-600">{data.totalRuns} runs</div>
              </div>
              <div className="text-right">
                <div className={`font-semibold ${getFeeColor(data.averageFee, stats.averageFee)}`}>
                  {formatFee(data.averageFee)}
                </div>
                <div className="text-sm text-gray-600">avg fee</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">By Severity</h4>
        <div className="space-y-3">
          {Object.entries(stats.severityBreakdown).map(([severity, data]) => (
            <div key={severity} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div>
                <div className="font-medium capitalize">{severity}</div>
                <div className="text-sm text-gray-600">{data.totalRuns} runs</div>
              </div>
              <div className="text-right">
                <div className={`font-semibold ${getFeeColor(data.averageFee, stats.averageFee)}`}>
                  {formatFee(data.averageFee)}
                </div>
                <div className="text-sm text-gray-600">avg fee</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (stats.totalRuns === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-lg font-medium mb-2">No Resource Fee Data</div>
          <div className="text-sm">No runs with resource fee information found in the selected time range.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Resource Fee Insights</h3>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <div className="flex bg-gray-100 rounded-md p-1">
            {(['overview', 'trends', 'breakdown'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'trends' && renderTrends()}
        {viewMode === 'breakdown' && renderBreakdown()}
      </div>
    </div>
  );
};

export default ResourceFeeInsightPanel;
