'use client';

import { useState } from 'react';

export default function AlertingSettingsPage54() {
  const [alerts, setAlerts] = useState([
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
  ]);

  const toggleAlert = (id: string) => {
    setAlerts(alerts.map(alert => 
      alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
    ));
  };

  const updateThreshold = (id: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setAlerts(alerts.map(alert => 
      alert.id === id ? { ...alert, threshold: numValue } : alert
    ));
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm mb-12">
      <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-8 rounded-lg bg-rose-600 dark:bg-rose-500 flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Alerting Settings</h2>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 ml-11">
          Configure threshold alerts for crash rate spikes and other critical events.
        </p>
      </div>
      
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
                      onChange={(e) => updateThreshold(alert.id, e.target.value)}
                      className="w-24 px-3 py-1.5 text-sm font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                    />
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{alert.unit}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => toggleAlert(alert.id)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 mt-1 ${
                alert.enabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
              aria-pressed={alert.enabled}
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
      
      <div className="px-8 py-6 bg-zinc-50/50 dark:bg-zinc-900/30 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-4">
        <button className="px-6 py-2.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition">
          Reset to Default
        </button>
        <button className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition transform active:scale-95">
          Save Configuration
        </button>
      </div>
    </div>
  );
}
