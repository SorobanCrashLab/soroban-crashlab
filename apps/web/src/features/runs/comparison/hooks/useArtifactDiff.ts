"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, FuzzingRun } from "@/app/types";
import { decodeContent, fetchArtifactContent } from "@/lib/artifact-content-utils";
import { detectArtifactKind } from "../diffing/diffEngine";
import { enqueueDiff } from "../diffing/diffWorkers";
import type { ArtifactComparison, ArtifactDiffResult, ArtifactDiffKind } from "../types";

export interface UseArtifactDiffOptions {
  baseline: FuzzingRun | null;
  candidate: FuzzingRun | null;
  artifactName: string | null;
  /** Override the detected diff kind (e.g. preview a binary artifact as hex). */
  forcedKind?: ArtifactDiffKind;
  /** Override content loading (tests / preloaded payloads). */
  contentProvider?: (run: FuzzingRun, artifact: Artifact) => Promise<string | Uint8Array>;
}

export interface UseArtifactDiffResult {
  comparison: ArtifactComparison | null;
  kinds: Record<string, ArtifactDiffKind>;
  refresh: () => void;
}

function findArtifact(run: FuzzingRun, name: string): Artifact | undefined {
  return run.artifacts?.find((artifact) => artifact.name === name);
}

async function defaultContentProvider(run: FuzzingRun, artifact: Artifact): Promise<string | Uint8Array> {
  const buffer = await fetchArtifactContent(artifact.id);
  const kind = detectArtifactKind(artifact);
  return kind === "binary" ? new Uint8Array(buffer) : decodeContent(buffer);
}

export function useArtifactDiff(options: UseArtifactDiffOptions): UseArtifactDiffResult {
  const { baseline, candidate, artifactName, forcedKind, contentProvider } = options;
  const [comparison, setComparison] = useState<ArtifactComparison | null>(null);
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  const kinds = useMemoKinds(baseline, candidate);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!baseline || !candidate || !artifactName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setComparison(null);
      return;
    }

    const baselineArtifact = findArtifact(baseline, artifactName);
    const candidateArtifact = findArtifact(candidate, artifactName);
    if (!baselineArtifact || !candidateArtifact) {
      setComparison({
        artifactName,
        kind: "text",
        status: "error",
        error: "Artifact is not available on both runs.",
      });
      return;
    }

    const kind = forcedKind ?? detectArtifactKind(baselineArtifact);
    setComparison({ artifactName, kind, status: "loading" });

    const load = contentProvider ?? defaultContentProvider;
    void Promise.all([load(baseline, baselineArtifact), load(candidate, candidateArtifact)])
      .then(([before, after]) => enqueueDiff({ kind, before, after }))
      .then((result: ArtifactDiffResult) => {
        if (requestId === requestRef.current) {
          setComparison({ artifactName, kind, status: "ready", result });
        }
      })
      .catch((error: unknown) => {
        if (requestId === requestRef.current) {
          setComparison({
            artifactName,
            kind,
            status: "error",
            error: error instanceof Error ? error.message : "Artifact diff failed.",
          });
        }
      });
  }, [baseline, candidate, artifactName, forcedKind, contentProvider, revision]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { comparison, kinds, refresh };
}

/** Derive the set of artifact names shared by both runs and their diff kinds. */
function useMemoKinds(baseline: FuzzingRun | null, candidate: FuzzingRun | null): Record<string, ArtifactDiffKind> {
  return useMemo(() => {
    if (!baseline || !candidate) return {};
    const candidateNames = new Set(candidate.artifacts?.map((artifact) => artifact.name) ?? []);
    const kinds: Record<string, ArtifactDiffKind> = {};
    for (const artifact of baseline.artifacts ?? []) {
      if (candidateNames.has(artifact.name)) kinds[artifact.name] = detectArtifactKind(artifact);
    }
    return kinds;
  }, [baseline, candidate]);
}
