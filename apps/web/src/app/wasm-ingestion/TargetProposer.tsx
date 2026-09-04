/**
 * Editable fuzz-target descriptor cards for the WASM ingestion page (#1434).
 *
 * Materialised from `createTargetProposerComponent()` in
 * `src/lib/wasm-parse/TargetProposer.tsx`, which only ever returned this
 * component as a string — the page imported a file that was never written,
 * which broke the production build.
 */
'use client';

import { useState } from 'react';
import { FuzzTargetDescriptor, ArgTemplate } from '@/lib/wasm-parse';

interface TargetProposerProps {
    descriptors: FuzzTargetDescriptor[];
    onUpdate: (descriptors: FuzzTargetDescriptor[]) => void;
    onCommit: (descriptors: FuzzTargetDescriptor[]) => void;
}

export default function TargetProposer({ 
    descriptors: initialDescriptors, 
    onUpdate, 
    onCommit 
}: TargetProposerProps) {
    const [descriptors, setDescriptors] = useState<FuzzTargetDescriptor[]>(initialDescriptors);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const handleArgChange = <K extends keyof ArgTemplate>(targetIdx: number, argIdx: number, field: K, value: ArgTemplate[K]) => {
        const newDescriptors = [...descriptors];
        newDescriptors[targetIdx] = {
            ...newDescriptors[targetIdx],
            argTemplates: newDescriptors[targetIdx].argTemplates.map((arg, i) => 
                i === argIdx ? { ...arg, [field]: value } : arg
            ),
        };
        setDescriptors(newDescriptors);
        onUpdate(newDescriptors);
    };

    const handleAddArg = (targetIdx: number) => {
        const newDescriptors = [...descriptors];
        newDescriptors[targetIdx] = {
            ...newDescriptors[targetIdx],
            argTemplates: [
                ...newDescriptors[targetIdx].argTemplates,
                { name: `arg${newDescriptors[targetIdx].argTemplates.length}`, type: 'i32', template: '0', isGuess: true }
            ],
        };
        setDescriptors(newDescriptors);
        onUpdate(newDescriptors);
    };

    const handleRemoveArg = (targetIdx: number, argIdx: number) => {
        if (descriptors[targetIdx].argTemplates.length <= 1) return;
        const newDescriptors = [...descriptors];
        newDescriptors[targetIdx] = {
            ...newDescriptors[targetIdx],
            argTemplates: newDescriptors[targetIdx].argTemplates.filter((_, i) => i !== argIdx),
        };
        setDescriptors(newDescriptors);
        onUpdate(newDescriptors);
    };

    const handleCommit = () => {
        onCommit(descriptors);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Fuzz Targets ({descriptors.length})
                </h3>
                <button
                    onClick={handleCommit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                    Commit Targets
                </button>
            </div>

            {descriptors.map((target, tIdx) => (
                <div key={tIdx} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="px-2 py-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 rounded">
                                {target.method}
                            </span>
                            <span className="px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded">
                                {target.source === 'heuristic' ? 'GUESS' : 'PARSED'}
                            </span>
                        </div>
                        <button
                            onClick={() => setEditingIndex(editingIndex === tIdx ? null : tIdx)}
                            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                            {editingIndex === tIdx ? 'Done' : 'Edit'}
                        </button>
                    </div>

                    {editingIndex === tIdx ? (
                        <div className="space-y-3">
                            {target.argTemplates.map((arg, aIdx) => (
                                <div key={aIdx} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        value={arg.name}
                                        onChange={(e) => handleArgChange(tIdx, aIdx, 'name', e.target.value)}
                                        className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500"
                                        placeholder="arg name"
                                    />
                                    <select
                                        value={arg.type}
                                        onChange={(e) => handleArgChange(tIdx, aIdx, 'type', e.target.value)}
                                        className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="i32">i32</option>
                                        <option value="i64">i64</option>
                                        <option value="f32">f32</option>
                                        <option value="f64">f64</option>
                                        <option value="v128">v128</option>
                                        <option value="funcref">funcref</option>
                                        <option value="externref">externref</option>
                                    </select>
                                    <input
                                        value={arg.template}
                                        onChange={(e) => handleArgChange(tIdx, aIdx, 'template', e.target.value)}
                                        className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                                        placeholder="template value"
                                    />
                                    <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            <input
                                                type="checkbox"
                                                checked={arg.isGuess}
                                                onChange={(e) => handleArgChange(tIdx, aIdx, 'isGuess', e.target.checked)}
                                                className="rounded border-zinc-300"
                                            />
                                            GUESS
                                        </label>
                                        <button
                                            onClick={() => handleRemoveArg(tIdx, aIdx)}
                                            className="text-red-500 hover:text-red-700 text-sm"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => handleAddArg(tIdx)}
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                + Add Argument
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {target.argTemplates.map((arg, aIdx) => (
                                <div key={aIdx} className="flex items-center gap-3 text-sm">
                                    <span className="px-2 py-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 rounded">
                                        {arg.name}
                                    </span>
                                    <span className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 rounded">
                                        {arg.type}
                                    </span>
                                    <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                                        = {arg.template}
                                    </span>
                                    {arg.isGuess && (
                                        <span className="px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded">
                                            GUESS
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {descriptors.length === 0 && (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                    No exported functions found in WASM module
                </div>
            )}
        </div>
    );
}
