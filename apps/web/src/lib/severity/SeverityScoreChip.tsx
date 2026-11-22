/**
 * Severity Score Chip with Popover Decomposition.
 * Displays composite score with factor breakdown bars.
 */


export interface SeverityScoreChipProps {
    scored: {
        score: number;
        factors: { key: string; value: number; weighted: number }[];
        suggestedSeverity: 'low' | 'medium' | 'high' | 'critical';
    };
    manualSeverity?: 'low' | 'medium' | 'high' | 'critical';
    onManualChange?: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
}

export function createSeverityScoreChipComponent(): string {
    return `
// SeverityScoreChip.tsx
'use client';

import { useState } from 'react';
import { ScoredCluster, SeverityMismatch, compareSeverity } from '@/lib/severity';

interface SeverityScoreChipProps {
    scored: {
        score: number;
        factors: { key: string; value: number; weighted: number }[];
        suggestedSeverity: 'low' | 'medium' | 'high' | 'critical';
    };
    manualSeverity?: 'low' | 'medium' | 'high' | 'critical';
    onManualChange?: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
}

const SEVERITY_COLORS = {
    low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200', bar: 'bg-green-500' },
    medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-200', bar: 'bg-amber-500' },
    high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-200', bar: 'bg-orange-500' },
    critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-200', bar: 'bg-red-500' },
} as const;

const FACTOR_LABELS: Record<string, string> = {
    frequency: 'Frequency',
    blastRadius: 'Blast Radius',
    novelty: 'Novelty',
    resourceImpact: 'Resource Impact',
};

export default function SeverityScoreChip({ 
    scored, 
    manualSeverity, 
    onManualChange 
}: SeverityScoreChipProps) {
    const [showPopover, setShowPopover] = useState(false);
    
    const suggestedColors = SEVERITY_COLORS[scored.suggestedSeverity];
    const manualColors = manualSeverity ? SEVERITY_COLORS[manualSeverity] : null;
    
    const mismatch = manualSeverity ? compareSeverity(manualSeverity, scored.suggestedSeverity) : null;
    const hasMismatch = mismatch?.hasMismatch ?? false;

    const factorBars = scored.factors.map(f => ({
        label: FACTOR_LABELS[f.key] || f.key,
        value: Math.round(f.value * 100),
        weighted: Math.round(f.weighted * 100),
    }));

    return (
        <div className="relative inline-flex items-center">
            {/* Main score chip */}
            <div className={\`flex items-center gap-2 px-3 py-1.5 rounded-full \${suggestedColors.bg} \${hasMismatch ? 'ring-2 ring-amber-500' : ''}\`}>
                <span className={\`font-bold text-sm \${suggestedColors.text}\`}>
                    {scored.score}
                </span>
                <span className={\`text-xs font-medium \${suggestedColors.text} uppercase\`}>
                    {scored.suggestedSeverity}
                </span>
            </div>

            {/* Manual severity selector (if provided) */}
            {manualSeverity && (
                <div className="ml-2 flex items-center gap-1">
                    <span className="text-xs text-muted">Manual:</span>
                    <select
                        value={manualSeverity}
                        onChange={(e) => onManualChange?.(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                        className={\`px-2 py-1 text-xs rounded border \${manualColors.bg} \${manualColors.text} focus:ring-2 focus:ring-blue-500\`}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                    
                    {hasMismatch && (
                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded">
                            {mismatch.delta > 0 ? '▲' : '▼'} {Math.abs(mismatch.delta)} level{'s' if Math.abs(mismatch.delta) !== 1}
                        </span>
                    )}
                </div>
            )}

            {/* Popover */}
            <button
                onClick={() => setShowPopover(!showPopover)}
                className="ml-1.5 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded transition"
                aria-label="Show factor breakdown"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>

            {showPopover && (
                <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-4 animate-fade-in">
                    <div className="flex-between mb-3">
                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Factor Breakdown
                        </h4>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="text-zinc-400 hover:text-zinc-600"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-3">
                        {factorBars.map((factor, idx) => (
                            <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-600 dark:text-zinc-400">{factor.label}</span>
                                    <span className="font-mono text-zinc-900 dark:text-zinc-100">
                                        {factor.weighted}%
                                    </span>
                                </div>
                                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{
                                            width: \`\${factor.weighted}%\`,
                                            backgroundColor: factor.weighted > 50 ? '#ef4444' : factor.weighted > 25 ? '#f59e0b' : '#22c55e',
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-muted">
                                    <span>Raw: {factor.value}%</span>
                                    <span>Weight: {SEVERITY_WEIGHTS[factor.key as keyof typeof SEVERITY_WEIGHTS] * 100}%</span>
                                </div>
                            </div>
                        ))}

                        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="flex justify-between font-medium">
                                <span>Composite Score</span>
                                <span className={\`text-lg \${suggestedColors.text}\`}>{scored.score}</span>
                            </div>
                            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: \`\${scored.score}%\`,
                                        backgroundColor: scored.score > 75 ? '#ef4444' : scored.score > 50 ? '#f97316' : scored.score > 25 ? '#f59e0b' : '#22c55e',
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Click outside to close */}
            <div
                className="fixed inset-0 z-40"
                onClick={() => setShowPopover(false)}
                style={showPopover ? { display: 'block' } : { display: 'none' }}
            />
        </div>
    );
}

// Need to export weights for UI
const SEVERITY_WEIGHTS = {
    frequency: 0.35,
    blastRadius: 0.25,
    novelty: 0.20,
    resourceImpact: 0.20,
};
`;
}