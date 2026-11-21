/** Unified diff patch export for artifact comparisons. */

import type { ArtifactComparison } from "../types";

export function buildPatch(comparisons: ArtifactComparison[]): string {
  const sections: string[] = [];
  for (const comparison of comparisons) {
    const result = comparison.result;
    if (!result) continue;
    if (result.kind === "text") {
      if (result.unifiedPatch) sections.push(`### ${comparison.artifactName}\n${result.unifiedPatch}`);
      continue;
    }
    if (result.kind === "json") {
      const lines = result.entries.map((entry) => {
        const sign = entry.type === "removed" ? "-" : entry.type === "added" ? "+" : "~";
        return `${sign} ${entry.path}: ${JSON.stringify(entry.before ?? null)} → ${JSON.stringify(entry.after ?? null)}`;
      });
      sections.push(`### ${comparison.artifactName} (structural JSON diff)\n${lines.join("\n")}`);
      continue;
    }
    const lines = result.chunks.map((chunk) => {
      const offset = `0x${chunk.offset.toString(16)}`;
      return `@@ ${offset} @@\n- ${chunk.beforeHex}\n+ ${chunk.afterHex}`;
    });
    sections.push(`### ${comparison.artifactName} (binary byte diff)\n${lines.join("\n")}`);
  }
  return sections.join("\n\n") + (sections.length > 0 ? "\n" : "");
}
