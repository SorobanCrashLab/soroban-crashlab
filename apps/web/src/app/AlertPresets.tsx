'use client';

import React, { useState, useEffect, useRef } from 'react';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presetRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleSelect = async (preset: typeof PRESETS[0]) => {
    setIsLoading(true);
    setError(null);
    setSelectedPresetId(preset.id);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 600));
      
      if (onSelectPreset) {
        onSelectPreset(preset.config);
      }
      setShowToast(true);
    } catch {
      setError('Failed to apply preset. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % PRESETS.length;
      presetRefs.current[nextIndex]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + PRESETS.length) % PRESETS.length;
      presetRefs.current[prevIndex]?.focus();
    }
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Alert Presets</h2>
        {error && (
          <div className="text-xs font-medium px-3 py-1 rounded-full animate-in fade-in slide-in-from-top-1"
               style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {error}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {PRESETS.map((preset, index) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              ref={el => { presetRefs.current[index] = el; }}
              onClick={() => handleSelect(preset)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={isLoading}
              className={`flex flex-col text-left p-5 rounded-xl border transition-all duration-200 relative overflow-hidden group ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              style={{
                borderColor: isSelected ? '#3b82f6' : 'var(--border-color)',
                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface)',
                boxShadow: isSelected ? '0 0 0 1px #3b82f6, 0 4px 6px rgba(0,0,0,0.1)' : 'none',
              }}
              aria-pressed={isSelected}
            >
              <h3 className="font-semibold text-base mb-2"
                  style={{ color: isSelected ? '#2563eb' : 'var(--text-primary)' }}>
                {preset.title}
              </h3>
              <p className="text-sm leading-relaxed"
                 style={{ color: 'var(--text-secondary)' }}>
                {preset.description}
              </p>
              
              {isSelected && !isLoading && (
                <div className="mt-3 inline-flex items-center text-xs font-medium"
                     style={{ color: '#2563eb' }}>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Selected
                </div>
              )}

              {isSelected && isLoading && (
                <div className="absolute inset-0 flex items-center justify-center"
                     style={{ background: 'rgba(59, 130, 246, 0.05)' }}>
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </button>
          );
        })}

        {/* Floating Toast Notification */}
        {showToast && (
          <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3"
               style={{ background: 'var(--text-primary)', color: 'var(--bg)' }}>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Preset applied successfully
          </div>
        )}
      </div>
    </div>
  );
}
