"use client";

import { useMemo, useState } from "react";
import type { FuzzingRun } from "@/app/types";
import { useArtifactDiff } from "../hooks/useArtifactDiff";
import type {
  ArtifactDiffKind,
  BinaryDiffResult,
  JsonDiffEntry,
  JsonDiffResult,
  TextDiffResult,
} from "../types";

const TABS: Array<{ id: ArtifactDiffKind; label: string }> = [
  { id: "text", label: "Text" },
  { id: "json", label: "JSON" },
  { id: "binary", label: "Binary" },
];

function TextDiffView({ result }: { result: TextDiffResult }) {
  if (result.hunks.length === 0) {
    return <p className="py-4 text-sm text-zinc-500">Artifacts are identical.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {result.additions} added · {result.deletions} deleted
      </p>
      <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
        {result.hunks.map((hunk) => (
          <div key={hunk.header}>
            <div className="text-sky-400">{hunk.header}</div>
            {hunk.lines.map((line, index) => (
              <div
                key={`${hunk.header}-${index}`}
                className={
                  line.kind === "added"
                    ? "bg-emerald-950/60 text-emerald-300"
                    : line.kind === "removed"
                      ? "bg-red-950/60 text-red-300"
                      : "text-zinc-400"
                }
              >
                <span aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span>{" "}
                {line.text}
              </div>
            ))}
          </div>
        ))}
      </pre>
    </div>
  );
}

const JSON_TYPE_CLASS: Record<JsonDiffEntry["type"], string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  removed: "text-red-600 dark:text-red-400",
  modified: "text-amber-600 dark:text-amber-400",
  "type-changed": "text-fuchsia-600 dark:text-fuchsia-400",
};

function JsonDiffView({ result }: { result: JsonDiffResult }) {
  if (result.entries.length === 0) {
    return <p className="py-4 text-sm text-zinc-500">No structural differences.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        {result.additions} added · {result.deletions} removed · {result.modifications} modified
      </p>
      <ul className="max-h-72 space-y-1 overflow-auto rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">
        {result.entries.map((entry, index) => (
          <li key={`${entry.path}-${index}`} className="font-mono">
            <span className={JSON_TYPE_CLASS[entry.type]}>{entry.type}</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">{entry.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BinaryDiffView({ result }: { result: BinaryDiffResult }) {
  const sizeLabel =
    result.sizeDelta === 0
      ? "same size"
      : `${result.sizeDelta > 0 ? "+" : ""}${result.sizeDelta} bytes (${result.sizeDeltaPercent?.toFixed(2) ?? "—"}%)`;
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-4 text-zinc-600 dark:text-zinc-400">
        <span>{result.baselineSize.toLocaleString()} → {result.candidateSize.toLocaleString()} bytes</span>
        <span className={result.sizeDelta > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
          {sizeLabel}
        </span>
        <span>{result.changedBytes.toLocaleString()} changed bytes</span>
      </div>
      {result.chunks.length === 0 ? (
        <p className="text-zinc-500">Binary payloads are byte-identical.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-auto rounded-xl border border-zinc-200 p-3 font-mono dark:border-zinc-800">
          {result.chunks.map((chunk) => (
            <li key={chunk.offset}>
              <div className="text-zinc-500">offset 0x{chunk.offset.toString(16)}</div>
              <div className="text-red-600 dark:text-red-400">- {chunk.beforeHex || "(empty)"}</div>
              <div className="text-emerald-600 dark:text-emerald-400">+ {chunk.afterHex || "(empty)"}</div>
            </li>
          ))}
        </ul>
      )}
      {result.truncated && <p className="text-amber-600">Showing first 512 changed regions.</p>}
      <p className="text-zinc-500">Changed regions are shown as hex dumps with byte offsets.</p>
    </div>
  );
}

export interface ArtifactDiffPanelProps {
  baseline: FuzzingRun | null;
  candidate: FuzzingRun | null;
  initialArtifactName?: string;
  onArtifactChange?: (name: string) => void;
}

export default function ArtifactDiffPanel({ baseline, candidate, initialArtifactName, onArtifactChange }: ArtifactDiffPanelProps) {
  const sharedNames = useMemo(() => {
    if (!baseline || !candidate) return [];
    const candidateNames = new Set(candidate.artifacts?.map((artifact) => artifact.name) ?? []);
    return (baseline.artifacts ?? []).map((artifact) => artifact.name).filter((name) => candidateNames.has(name));
  }, [baseline, candidate]);

  const [artifactName, setArtifactName] = useState<string | null>(initialArtifactName ?? sharedNames[0] ?? null);
  const [kind, setKind] = useState<ArtifactDiffKind | null>(null);
  const activeName = artifactName && sharedNames.includes(artifactName) ? artifactName : sharedNames[0] ?? null;
  const { comparison, refresh } = useArtifactDiff({ baseline, candidate, artifactName: activeName, forcedKind: kind ?? undefined });

  if (!baseline || !candidate || sharedNames.length === 0) {
    return (
      <section aria-label="Artifact diff" className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold">Artifact diff</h3>
        <p className="mt-2 text-sm text-zinc-500">No shared artifacts are available for these runs.</p>
      </section>
    );
  }

  const result = comparison?.status === "ready" ? comparison.result : undefined;

  return (
    <section aria-label="Artifact diff" className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Artifact diff</h3>
        <label htmlFor="comparison-artifact" className="sr-only">Artifact to compare</label>
        <select
          id="comparison-artifact"
          value={activeName ?? ""}
          onChange={(event) => {
            setArtifactName(event.target.value);
            setKind(null);
            onArtifactChange?.(event.target.value);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {sharedNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button type="button" onClick={refresh} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
          Refresh
        </button>
      </div>

      <div role="tablist" aria-label="Diff view" className="mb-3 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={(kind ?? comparison?.kind) === tab.id}
            onClick={() => setKind(tab.id)}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              (kind ?? comparison?.kind) === tab.id
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {comparison?.status === "loading" && <p className="py-4 text-sm text-zinc-500">Computing diff…</p>}
      {comparison?.status === "error" && <p className="py-4 text-sm text-red-600">{comparison.error}</p>}
      {result?.kind === "text" && <TextDiffView result={result} />}
      {result?.kind === "json" && <JsonDiffView result={result} />}
      {result?.kind === "binary" && <BinaryDiffView result={result} />}
    </section>
  );
}
