'use client';

import React, { useState } from 'react';
import { redactPayload } from '@/lib/mocks/scenario-runtime';

export function TrafficRecorder() {
  const [rawInput, setRawInput] = useState<string>(
    JSON.stringify({ runId: 'run-42', authorization: 'Bearer secret-token', status: 'crashed' }, null, 2),
  );
  const [redactedOutput, setRedactedOutput] = useState<string>('');

  const handleRedact = () => {
    try {
      const parsed = JSON.parse(rawInput);
      setRedactedOutput(JSON.stringify(redactPayload(parsed), null, 2));
    } catch {
      setRedactedOutput('Invalid JSON payload');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Record & Redact Live/Fixture Traffic</h3>
        <button
          type="button"
          onClick={handleRedact}
          className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
        >
          Redact & Snapshot
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <textarea
          rows={5}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          aria-label="Raw captured payload"
          className="rounded border border-zinc-700 bg-zinc-900 p-2 font-mono text-xs text-zinc-200"
        />
        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-2 font-mono text-xs text-emerald-300">
          {redactedOutput || 'Click "Redact & Snapshot" to preview sanitized scenario fixture.'}
        </pre>
      </div>
    </div>
  );
}
