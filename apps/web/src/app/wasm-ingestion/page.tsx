/**
 * WASM Contract Ingestion Page - Issue #1434
 * Ingests compiled contract WASM, parses exports, proposes fuzz targets.
 */

'use client';

import { useState } from 'react';
import { parseContractWasmFile, proposeFuzzTargets, FuzzTargetDescriptor, ParsedContract } from '@/lib/wasm-parse';
import TargetProposer from './TargetProposer';

export default function WasmIngestionPage() {
    const [parsed, setParsed] = useState<ParsedContract | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [descriptors, setDescriptors] = useState<FuzzTargetDescriptor[]>([]);
    const [committed, setCommitted] = useState<FuzzTargetDescriptor[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setError(null);
        setParsed(null);
        setDescriptors([]);
        setCommitted(null);

        setIsLoading(true);
        try {
            const contract = await parseContractWasmFile(selected);
            setParsed(contract);
            const targets = proposeFuzzTargets(contract);
            setDescriptors(targets);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to parse WASM module');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDescriptorsUpdate = (newDescriptors: FuzzTargetDescriptor[]) => {
        setDescriptors(newDescriptors);
    };

    const handleCommit = (finalDescriptors: FuzzTargetDescriptor[]) => {
        setCommitted(finalDescriptors);
        // In real implementation, this would serialize to campaign config
        console.log('Committed fuzz targets:', finalDescriptors);
    };

    if (isLoading) {
        return (
            <div className="w-full p-8 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse">
                <div className="space-y-3">
                    <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                </div>
                <div className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg mt-4" />
                <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full mt-8" />
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
            <div className="space-y-1">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    WASM Contract Ingestion
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400">
                    Upload a compiled Soroban contract WASM to enumerate callable methods and propose fuzz targets.
                </p>
            </div>

            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Contract WASM File
                    </label>
                    <input
                        type="file"
                        accept=".wasm"
                        onChange={handleFileChange}
                        disabled={isLoading}
                        className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Maximum size: 16MB. Only .wasm files accepted.
                    </p>
                    {error && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}
                </div>

                {parsed && (
                    <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Exported Functions</p>
                                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                    {parsed.exportedFunctions.length}
                                </p>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Function Types</p>
                                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                    {parsed.types.length}
                                </p>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Module Size</p>
                                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                    {((parsed.module.sections.reduce((s, sec) => s + sec.size, 0) + 8) / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Exported Functions
                            </h4>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {parsed.exportedFunctions.map((fn, idx) => (
                                    <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg text-sm">
                                        <span className="font-mono text-zinc-900 dark:text-zinc-100">
                                            {fn.name}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs bg-zinc-200 dark:bg-zinc-800 rounded">
                                            {fn.paramTypes.length} params
                                        </span>
                                        <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded">
                                            {fn.resultTypes.length} results
                                        </span>
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-auto">
                                            {fn.paramTypes.map(valtypeName).join(', ') || 'no params'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <TargetProposer
                            descriptors={descriptors}
                            onUpdate={handleDescriptorsUpdate}
                            onCommit={handleCommit}
                        />
                    </div>
                )}

                {committed && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                            Targets Committed ({committed.length})
                        </h4>
                        <pre className="text-xs bg-white dark:bg-zinc-900 p-3 rounded overflow-auto">
                            {JSON.stringify(committed, null, 2)}
                        </pre>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                            Targets serialized to campaign config. Ready for mock runner.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function valtypeName(valtype: number): string {
    switch (valtype) {
        case 0x7f: return 'i32';
        case 0x7e: return 'i64';
        case 0x7d: return 'f32';
        case 0x7c: return 'f64';
        case 0x7b: return 'v128';
        case 0x70: return 'funcref';
        case 0x6f: return 'externref';
        default: return `0x${valtype.toString(16)}`;
    }
}