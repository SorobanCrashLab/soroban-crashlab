'use client';

import React, { useState } from 'react';

type WebhookConfig = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
};

const AVAILABLE_EVENTS = [
  'run_started',
  'run_completed',
  'run_failed',
  'run_cancelled',
  'invariant_violated'
];

export default function IntegrateWebhookManagerForRunEvents() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([
    { id: '1', url: 'https://api.example.com/webhooks/soroban', events: ['run_failed', 'invariant_violated'], active: true }
  ]);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['run_failed']);

  const addWebhook = () => {
    if (!newUrl) return;
    const newWebhook: WebhookConfig = {
      id: Math.random().toString(36).substr(2, 9),
      url: newUrl,
      events: selectedEvents,
      active: true
    };
    setWebhooks([...webhooks, newWebhook]);
    setNewUrl('');
    setSelectedEvents(['run_failed']);
  };

  const removeWebhook = (id: string) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev => 
      prev.includes(event) 
        ? prev.filter(e => e !== event) 
        : [...prev, event]
    );
  };

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-zinc-50 p-8 dark:border-white/[.145] dark:bg-zinc-950/50">
      <div className="flex flex-col xl:flex-row gap-12">
        <div className="xl:w-1/3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-purple-600 dark:text-purple-400">
            Integrations
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-4">Webhook Manager</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
            Configure external endpoints to receive real-time notifications for fuzzing run lifecycle events. 
            Perfect for Discord bots, custom CI notifications, or automated triage services.
          </p>

          <div className="space-y-6 bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
            <div>
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">Endpoint URL</label>
              <input 
                type="url" 
                placeholder="https://notify.mysite.com/hook"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-3 text-zinc-700 dark:text-zinc-300">Trigger Events</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map(event => (
                  <button
                    key={event}
                    onClick={() => toggleEvent(event)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      selectedEvents.includes(event)
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200'
                    }`}
                  >
                    {event.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={addWebhook}
              className="w-full py-4 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 shadow-lg shadow-purple-500/20 active:scale-95 transition"
            >
              Connect Webhook
            </button>
          </div>
        </div>

        <div className="xl:w-2/3">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">Active Configuration</h3>
            <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 rounded-full text-xs font-bold uppercase tracking-widest">
              Live
            </span>
          </div>

          <div className="grid gap-4">
            {webhooks.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2rem] text-center text-zinc-500">
                No active webhooks configured.
              </div>
            ) : (
              webhooks.map(hook => (
                <div key={hook.id} className="group flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-300 transition-all shadow-sm hover:shadow-md">
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
                      <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{hook.url}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hook.events.map(e => (
                        <span key={e} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-[10px] rounded-md font-medium text-zinc-500 dark:text-zinc-400">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => removeWebhook(hook.id)}
                    className="self-end md:self-center px-4 py-2 text-rose-600 font-bold text-sm hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition"
                  >
                    Disconnect
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 p-6 bg-purple-50 dark:bg-purple-900/20 rounded-[2rem] border border-purple-100 dark:border-purple-900/40">
            <div className="flex gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-purple-900 dark:text-purple-100 text-sm">Security Note</h4>
                <p className="text-sm text-purple-800/80 dark:text-purple-300/80 mt-1 leading-relaxed">
                  Webhooks are signed with a unique secret per endpoint. Always verify the `X-CrashLab-Signature` header to ensure requests originate from our servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
