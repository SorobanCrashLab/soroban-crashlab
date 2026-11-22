'use client';

import { useState } from 'react';
import { generateMockHeatmapData, getHeatmapColor, getMonthWeeks } from './heatmap-utils';

export default function HeatmapCalendarPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const data = generateMockHeatmapData();
  const weeks = getMonthWeeks(selectedYear, selectedMonth);

  const monthName = new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const getDataForDate = (dateStr: string) => {
    return data.find(d => d.date === dateStr);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Run Heatmap Calendar
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Visualize fuzzing run frequency and severity by date
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {monthName}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrevMonth}
                    className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-2">
                      {week.map((day, dayIndex) => (
                        <button
                          key={dayIndex}
                          onClick={() => setSelectedDate(day.date)}
                          className={`aspect-square rounded-lg font-semibold text-xs transition-all hover:ring-2 hover:ring-blue-400 ${
                            day.date
                              ? `cursor-pointer ${selectedDate === day.date ? 'ring-2 ring-blue-600' : ''}`
                              : 'cursor-default'
                          }`}
                          style={{
                            backgroundColor: getHeatmapColor(day.count, day.severity),
                          }}
                          title={day.date ? `${day.date}: ${day.runs} runs, ${day.count} crashes` : ''}
                        >
                          {day.date && day.date.split('-')[2]}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Severity Scale</h3>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Low', severity: 'low' },
                    { label: 'Medium', severity: 'medium' },
                    { label: 'High', severity: 'high' },
                    { label: 'Critical', severity: 'critical' },
                  ].map(item => (
                    <div key={item.severity}>
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: getHeatmapColor(3, item.severity) }}
                        ></div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 sticky top-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                {selectedDate ? 'Day Details' : 'Select a Date'}
              </h3>

              {selectedDate ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
                      Date
                    </span>
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  {(() => {
                    const dayData = getDataForDate(selectedDate);
                    return dayData ? (
                      <>
                        <div>
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
                            Total Runs
                          </span>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {dayData.runs}
                          </p>
                        </div>

                        <div>
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
                            Crashes Detected
                          </span>
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {dayData.count}
                          </p>
                        </div>

                        <div>
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
                            Max Severity
                          </span>
                          <span
                            className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold capitalize ${
                              dayData.severity === 'critical'
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                : dayData.severity === 'high'
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                                : dayData.severity === 'medium'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {dayData.severity}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-zinc-500 dark:text-zinc-400">No data for this date</p>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Click on a date in the calendar to view details
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
