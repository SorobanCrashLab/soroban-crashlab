/** Diff orchestrator: detects artifact kind and dispatches to the right engine. */

import type { Artifact } from "@/app/types";
import type { ArtifactDiffKind, ArtifactDiffResult } from "../types";
import { diffBinary } from "./binaryDiff";
import { diffJson } from "./jsonDiff";
import { diffText } from "./textDiff";

const BINARY_EXTENSIONS = /\.(bin|wasm|dat|o|zip|gz|png|jpg|jpeg|webp|pdf|class)$/i;

export function detectArtifactKind(artifact: Pick<Artifact, "name" | "contentType" | "type">): ArtifactDiffKind {
  if (artifact.contentType === "hex" || BINARY_EXTENSIONS.test(artifact.name)) return "binary";
  if (artifact.contentType === "json" || /\.json$/i.test(artifact.name)) return "json";
  return "text";
}

export interface DiffInput {
  kind: ArtifactDiffKind;
  before: string | Uint8Array;
  after: string | Uint8Array;
  beforeName?: string;
  afterName?: string;
}

function asText(value: string | Uint8Array): string {
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value);
}

function asBytes(value: string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

/** Synchronous diff entry point. The worker pool wraps this for large inputs. */
export function runDiff(input: DiffInput): ArtifactDiffResult {
  switch (input.kind) {
    case "binary":
      return diffBinary(asBytes(input.before), asBytes(input.after));
    case "json":
      return diffJson(asText(input.before), asText(input.after));
    case "text":
      return diffText(
        asText(input.before),
        asText(input.after),
        input.beforeName ?? "a/artifact",
        input.afterName ?? "b/artifact",
      );
  }
}

export function diffArtifact(
  artifact: Pick<Artifact, "name" | "contentType" | "type">,
  before: string | Uint8Array,
  after: string | Uint8Array,
): ArtifactDiffResult {
  return runDiff({ kind: detectArtifactKind(artifact), before, after, beforeName: `a/${artifact.name}`, afterName: `b/${artifact.name}` });
}
