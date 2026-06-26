'use client';

import { useState } from 'react';
import { CampaignConfig, CampaignSeedSource, CampaignAuthMode } from './types';
import { api } from '../lib/api-client';

interface CampaignConfigFormProps {
    onSubmit: (config: CampaignConfig) => void;
    onCancel: () => void;
}

export default function CampaignConfigForm({ onSubmit, onCancel }: CampaignConfigFormProps) {
    const [config, setConfig] = useState<CampaignConfig>({
        seedSource: 'random',
        authMode: 'none',
        parallelism: 4,
        timeoutSeconds: 3600,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.campaigns.create(config);
            onSubmit(config);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to launch campaign');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Campaign Configuration</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Define the parameters for your new fuzzing campaign.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label htmlFor="seedSource" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Seed Source
                    </label>
                    <select
                        id="seedSource"
                        value={config.seedSource}
                        onChange={(e) => setConfig({ ...config, seedSource: e.target.value as CampaignSeedSource })}
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                        <option value="random">Random Mutation</option>
                        <option value="corpus">Existing Corpus</option>
                        <option value="replay">Specific Replay</option>
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Where the initial fuzzing inputs come from.</p>
                </div>

                <div className="space-y-2">
                    <label htmlFor="authMode" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Auth Mode
                    </label>
                    <select
                        id="authMode"
                        value={config.authMode}
                        onChange={(e) => setConfig({ ...config, authMode: e.target.value as CampaignAuthMode })}
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                        <option value="none">None (Public)</option>
                        <option value="mock">Mock Ledger Auth</option>
                        <option value="keypair">Signed Keypair</option>
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Authentication strategy for contract calls.</p>
                </div>

                <div className="space-y-2">
                    <label htmlFor="parallelism" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Parallelism
                    </label>
                    <input
                        id="parallelism"
                        type="number"
                        min={1}
                        max={32}
                        value={config.parallelism}
                        onChange={(e) => setConfig({ ...config, parallelism: parseInt(e.target.value) })}
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Number of parallel fuzzing workers (1-32).</p>
                </div>

                <div className="space-y-2">
                    <label htmlFor="timeout" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Timeout (seconds)
                    </label>
                    <input
                        id="timeout"
                        type="number"
                        min={60}
                        value={config.timeoutSeconds}
                        onChange={(e) => setConfig({ ...config, timeoutSeconds: parseInt(e.target.value) })}
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Maximum duration before auto-stopping.</p>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm active:scale-95 transition-all disabled:opacity-60"
                >
                    {submitting ? 'Launching…' : 'Launch Campaign'}
                </button>
            </div>
        </form>
    );
}
