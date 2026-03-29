'use client';

import React, { useState, useEffect } from 'react';

export const PRESETS = [
  {
    id: 'high-failure-rate',
    title: 'High Failure Rate (>50%)',
    description: 'Alerts you when the test failure rate exceeds 50% across runs.',
    config: {
      threshold: 50,
      type: 'failure_rate'
    }
  },
  {
    id: 'low-success-rate',
    title: 'Low Success Rate (<30%)',
    description: 'Triggers when successful contract executions drop below 30%.',
    config: {
      threshold: 30,
      type: 'success_rate'
    }
  },
  {
    id: 'high-crash-frequency',
    title: 'High Crash Frequency',
    description: 'Notifies upon detecting multiple consecutive crashes in a short span.',
    config: {
      threshold: 5,
      type: 'crash_frequency'
    }
  },
  {
    id: 'new-failure-detected',
    title: 'New Failure Detected',
    description: 'Immediate alert when a previously unseen failure signature occurs.',
    config: {
      threshold: 1,
      type: 'new_failure'
    }
  }
];

export interface AlertPresetConfig {
  threshold: number;
  type: string;
}

export interface AlertPresetsProps {
  onSelectPreset?: (config: AlertPresetConfig) => void;
}

export default function AlertPresets({ onSelectPreset }: AlertPresetsProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const handleSelect = (preset: typeof PRESETS[0]) => {
    setSelectedPresetId(preset.id);
    if (onSelectPreset) {
      onSelectPreset(preset.config);
    }
    
    // Show toast for UX Feedback
    setShowToast(true);
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Alert Presets</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {PRESETS.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={`flex flex-col text-left p-5 rounded-xl border transition-all duration-200 
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 shadow-md ring-1 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-950' 
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm hover:-translate-y-0.5'
                }
              `}
            >
              <h3 className={`font-semibold text-base mb-2 ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                {preset.title}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {preset.description}
              </p>
              
              {isSelected && (
                <div className="mt-3 inline-flex items-center text-xs font-medium text-blue-600 dark:text-blue-400">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Selected
                </div>
              )}
            </button>
          );
        })}

        {/* Floating Toast Notification */}
        {showToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            Preset applied successfully
          </div>
        )}
      </div>
    </div>
  );
}
