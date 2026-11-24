"use client";

import { use, useState } from 'react';
import Link from 'next/link';
import RunbookExecutionView from '@/features/runbooks/RunbookExecution';
import type { RunbookRole } from '@/features/runbooks/model';

/** Execution view – /runbooks/:executionId (resumable; polls for collaborator updates). */
export default function RunbookExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [role, setRole] = useState<RunbookRole>('responder');
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Link href="/runbooks" className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Runbooks</Link>
        <label className="flex items-center gap-2 text-sm">
          Acting as
          <select value={role} onChange={(e) => setRole(e.target.value as RunbookRole)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
            <option value="viewer">viewer</option>
            <option value="responder">responder</option>
            <option value="maintainer">maintainer</option>
          </select>
        </label>
      </div>
      <RunbookExecutionView id={id} identity={{ user: `demo-${role}`, role }} />
    </main>
  );
}
