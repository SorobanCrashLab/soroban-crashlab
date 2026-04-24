'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertConfig, toggleAlert, updateAlertThreshold, validateAlerts } from './alerting-settings-utils';

const DEFAULT_ALERTS: AlertConfig[] = [
  {
    id: 'crash-rate-spike',
    name: 'Crash Rate Spike',
    description: 'Alert when the crash rate increases by a certain percentage over a short period.',
    enabled: true,
    threshold: 15,
    unit: '%',
  },
  {
    id: 'resource-exhaustion',
    name: 'Resource Exhaustion',
    description: 'Alert when a run consistently hits resource limits (CPU or Memory).',
    enabled: false,
    threshold: 90,
    unit: '%',
  },
  {
    id: 'consecutive-failures',
    name: 'Consecutive Failures',
    description: 'Alert when multiple consecutive fuzzing runs fail.',
    enabled: true,
    threshold: 5,
    unit: 'runs',
  },
];

export default function AlertingSettingsPage54() {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mock API fetch
  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
        if (isMounted) {
          setAlerts(DEFAULT_ALERTS);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setError('Failed to load alerting settings.');
          setIsLoading(false);
        }
      }
    };
    fetchSettings();
    return () => { isMounted = false; };
  }, []);

  const handleToggle = useCallback((id: string) => {
    setAlerts(prev => {
      const next = toggleAlert(prev, id);
      setValidationError(validateAlerts(next));
      setSaveSuccess(false);
      return next;
    });
  }, []);

  const handleThresholdChange = useCallback((id: string, value: string) => {
    setAlerts(prev => {
      const next = updateAlertThreshold(prev, id, value);
      setValidationError(validateAlerts(next));
      setSaveSuccess(false);
      return next;
    });
  }, []);

  const handleSave = async () => {
    const vErr = validateAlerts(alerts);
    if (vErr) {
      setValidationError(vErr);
      return;
    }
    
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // 5% chance of mock failure
          if (Math.random() < 0.05) reject(new Error('Network error'));
          else resolve(null);
        }, 1000);
      });
      
      setSaveSuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setAlerts(DEFAULT_ALERTS);
    setValidationError(null);
    setError(null);
    setSaveSuccess(false);
  };

  if (isLoading) {
    return (
      <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm mb-12 animate-pulse">
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-700"></div>
            <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
          </div>
          <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-700 rounded mt-2 ml-11"></div>
        </div>
        <div className="p-8 space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-6 pb-8 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex-1">
                <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-700 rounded mb-2"></div>
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded mb-4"></div>
              </div>
              <div className="h-7 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm mb-12">
      <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-8 rounded-lg bg-rose-600 dark:bg-rose-500 flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Alerting Settings</h2>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 ml-11">
          Configure threshold alerts for crash rate spikes and other critical events.
        </p>
      </div>
      
      {error && (
        <div className="mx-8 mt-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg text-red-700 dark:text-red-400 text-sm font-medium flex items-center gap-2" role="alert">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {validationError && (
        <div className="mx-8 mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2" role="alert">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {validationError}
        </div>
      )}

      <div className="p-8 space-y-8">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-start justify-between gap-6 pb-8 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">{alert.name}</h3>
                <span className={`px-2.5 py-0.5 text-xs rounded-full font-semibold uppercase tracking-wider ${
                  alert.enabled 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                }`}>
                  {alert.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{alert.description}</p>
              
              <div className={`transition-all duration-300 overflow-hidden ${alert.enabled ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-700">
                  <label htmlFor={`threshold-${alert.id}`} className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Alert Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id={`threshold-${alert.id}`}
                      value={alert.threshold}
                      onChange={(e) => handleThresholdChange(alert.id, e.target.value)}
                      disabled={!alert.enabled}
                      aria-label={`${alert.name} threshold`}
                      className="w-24 px-3 py-1.5 text-sm font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow disabled:opacity-50"
                    />
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400" aria-hidden="true">{alert.unit}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => handleToggle(alert.id)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 mt-1 ${
                alert.enabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
              aria-pressed={alert.enabled}
              aria-label={`Toggle ${alert.name} alert`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  alert.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
      
      <div className="px-8 py-6 bg-zinc-50/50 dark:bg-zinc-900/30 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
        <div>
          {saveSuccess && (
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1" role="status">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Settings saved
            </span>
          )}
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleReset}
            disabled={isSaving}
            className="px-6 py-2.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition disabled:opacity-50"
          >
            Reset to Default
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving || !!validationError}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition transform active:scale-95 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
