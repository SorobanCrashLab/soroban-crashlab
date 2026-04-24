"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// Artifact interface - mirrors the shape in add-artifact-explorer.tsx
export interface Artifact {
  id: string;
  name: string;
  type: "seed" | "log" | "trace" | "coverage" | "bundle";
  size: number; // bytes
  updatedAt: string; // ISO 8601
  runId?: string;
  content_hash?: string;
}

export type ArtifactPreviewDataState = "loading" | "error" | "success";

export interface ArtifactPreviewModalProps {
  artifact: Artifact | null;
  isOpen: boolean;
  onClose: () => void;
  dataState?: ArtifactPreviewDataState;
  onRetry?: () => void;
  errorMessage?: string;
  className?: string;
}

/**
 * formatSize — converts a byte count to a human-readable string.
 * Examples: 512 → "512 B", 2048 → "2.0 KB", 1572864 → "1.5 MB"
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * formatDate — formats an ISO 8601 timestamp using Intl.DateTimeFormat.
 * Falls back to the raw string if parsing fails.
 */
export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * generatePreviewContent — deterministically generates a simulated content
 * preview string for an artifact, derived from the artifact's id.
 */
export function generatePreviewContent(artifact: Artifact): string {
  const idBytes = Array.from(artifact.id).map((c) => c.charCodeAt(0));

  if (artifact.type === "seed" || artifact.type === "bundle") {
    // Hex-dump: rows of 16 bytes, address + hex + ascii
    const rows: string[] = [];
    const totalRows = Math.max(4, Math.min(16, idBytes.length));
    for (let row = 0; row < totalRows; row++) {
      const offset = (row * 16).toString(16).padStart(8, "0");
      const hexCols: string[] = [];
      const asciiCols: string[] = [];
      for (let col = 0; col < 16; col++) {
        const byte = idBytes[(row * 16 + col) % idBytes.length];
        hexCols.push(byte.toString(16).padStart(2, "0"));
        asciiCols.push(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".");
      }
      rows.push(
        `${offset}  ${hexCols.slice(0, 8).join(" ")}  ${hexCols.slice(8).join(" ")}  |${asciiCols.join("")}|`
      );
    }
    return rows.join("\n");
  }

  if (artifact.type === "log") {
    const lines: string[] = [];
    const levels = ["INFO", "DEBUG", "WARN", "ERROR"];
    const messages = [
      "Fuzzer started",
      "Corpus loaded",
      "Mutation applied",
      "New coverage edge found",
      "Crash detected",
      "Seed saved",
      "Run complete",
      "Artifact written",
    ];
    const baseTs = 1700000000000 + (idBytes[0] ?? 0) * 1000000;
    for (let i = 0; i < 12; i++) {
      const ts = new Date(baseTs + i * 1234 * (idBytes[i % idBytes.length] + 1)).toISOString();
      const level = levels[(idBytes[i % idBytes.length] ?? 0) % levels.length];
      const msg = messages[(idBytes[(i + 1) % idBytes.length] ?? 0) % messages.length];
      lines.push(`${ts} [${level}] ${msg}`);
    }
    return lines.join("\n");
  }

  if (artifact.type === "trace") {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      step: i + 1,
      fn: `fn_${idBytes[i % idBytes.length].toString(16)}`,
      args: [idBytes[(i + 1) % idBytes.length], idBytes[(i + 2) % idBytes.length]],
      ret: idBytes[(i + 3) % idBytes.length],
      duration_us: idBytes[(i + 4) % idBytes.length] * 13 + 7,
    }));
    return JSON.stringify({ artifact_id: artifact.id, execution_steps: steps }, null, 2);
  }

  if (artifact.type === "coverage") {
    const base = idBytes[0] ?? 50;
    const linePct = ((base % 50) + 50).toFixed(1);
    const branchPct = (((idBytes[1] ?? 40) % 40) + 40).toFixed(1);
    const fnPct = (((idBytes[2] ?? 60) % 35) + 60).toFixed(1);
    const totalLines = 200 + (idBytes[3] ?? 0) * 3;
    const coveredLines = Math.floor((totalLines * parseFloat(linePct)) / 100);
    return [
      `Coverage Report — ${artifact.name}`,
      `${"─".repeat(40)}`,
      `Lines     : ${linePct}%  (${coveredLines}/${totalLines})`,
      `Branches  : ${branchPct}%`,
      `Functions : ${fnPct}%`,
      `${"─".repeat(40)}`,
      `Generated from artifact id: ${artifact.id}`,
    ].join("\n");
  }

  return "";
}

/**
 * Loading skeleton component for artifact preview
 */
const ArtifactPreviewSkeleton: React.FC = () => (
  <div className="animate-pulse">
    <div className="mb-4 pr-8">
      <div className="h-6 w-48 bg-zinc-300 dark:bg-zinc-700 rounded mb-2"></div>
      <div className="flex gap-2 mb-3">
        <div className="h-5 w-16 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
        <div className="h-5 w-20 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
        <div className="h-5 w-24 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
        <div className="h-4 w-28 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
      </div>
    </div>
    <div>
      <div className="h-4 w-16 bg-zinc-300 dark:bg-zinc-700 rounded mb-2"></div>
      <div className="h-64 w-full bg-zinc-300 dark:bg-zinc-700 rounded"></div>
    </div>
  </div>
);

/**
 * Error state component for artifact preview
 */
const ArtifactPreviewError: React.FC<{ onRetry?: () => void; errorMessage?: string }> = ({
  onRetry,
  errorMessage = "Failed to load artifact preview",
}) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <div className="w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
      <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Preview Unavailable</h3>
    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 max-w-sm">{errorMessage}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
      >
        Try Again
      </button>
    )}
  </div>
);

/**
 * Preview components for different artifact types
 */
const SeedPreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => (
  <pre className="font-mono text-xs bg-zinc-900 dark:bg-zinc-950 text-green-400 p-4 rounded-lg overflow-auto max-h-64 border border-zinc-700 dark:border-zinc-800">
    {generatePreviewContent(artifact)}
  </pre>
);

const BundlePreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => (
  <pre className="font-mono text-xs bg-zinc-900 dark:bg-zinc-950 text-purple-400 p-4 rounded-lg overflow-auto max-h-64 border border-zinc-700 dark:border-zinc-800">
    {generatePreviewContent(artifact)}
  </pre>
);

const LogPreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => (
  <pre className="font-mono text-xs bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-auto max-h-64 border border-zinc-700 dark:border-zinc-800">
    {generatePreviewContent(artifact)}
  </pre>
);

const TracePreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => (
  <pre className="font-mono text-xs bg-zinc-900 dark:bg-zinc-950 text-yellow-300 p-4 rounded-lg overflow-auto max-h-64 border border-zinc-700 dark:border-zinc-800">
    {generatePreviewContent(artifact)}
  </pre>
);

const CoveragePreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const lines = generatePreviewContent(artifact).split("\n");
  return (
    <div className="text-sm text-zinc-200 dark:text-zinc-300 space-y-1 bg-zinc-800 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-700 dark:border-zinc-800">
      {lines.map((line, i) => (
        <div key={i} className="font-mono text-xs whitespace-pre">
          {line}
        </div>
      ))}
    </div>
  );
};

/**
 * Main content preview component that switches based on artifact type
 */
const ArtifactContentPreview: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  switch (artifact.type) {
    case "seed":
      return <SeedPreview artifact={artifact} />;
    case "bundle":
      return <BundlePreview artifact={artifact} />;
    case "log":
      return <LogPreview artifact={artifact} />;
    case "trace":
      return <TracePreview artifact={artifact} />;
    case "coverage":
      return <CoveragePreview artifact={artifact} />;
    default:
      return (
        <div className="flex items-center justify-center py-8 text-zinc-500 dark:text-zinc-400">
          <p className="text-sm">Unsupported artifact type: {(artifact as Artifact).type}</p>
        </div>
      );
  }
};

/**
 * Enhanced Artifact Preview Modal with loading/error states and full accessibility
 */
const ArtifactPreviewModal: React.FC<ArtifactPreviewModalProps> = ({
  artifact,
  isOpen,
  onClose,
  dataState = "success",
  onRetry,
  errorMessage,
  className = "",
}) => {
  const [mounted, setMounted] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Handle copy to clipboard functionality
  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    
    try {
      const content = generatePreviewContent(artifact);
      await navigator.clipboard.writeText(content);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [artifact]);

  // Handle download functionality
  const handleDownload = useCallback(() => {
    if (!artifact) return;

    const content = generatePreviewContent(artifact);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.name}-preview.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [artifact]);

  // Scroll lock when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus management and focus trap
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = document.activeElement;
    
    // Focus the close button after a brief delay to ensure modal is rendered
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      
      const focusable: HTMLElement[] = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      );
      
      if (focusable.length === 0) return;
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleFocusTrap);
    
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleFocusTrap);
      if (triggerRef.current && "focus" in triggerRef.current) {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, [isOpen]);

  // SSR mount guard
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!isOpen || !mounted) return null;

  const typeBadgeColors: Record<Artifact["type"], string> = {
    seed: "bg-blue-600 dark:bg-blue-700 text-blue-100",
    log: "bg-zinc-600 dark:bg-zinc-700 text-zinc-100",
    trace: "bg-yellow-600 dark:bg-yellow-700 text-yellow-100",
    coverage: "bg-green-600 dark:bg-green-700 text-green-100",
    bundle: "bg-purple-600 dark:bg-purple-700 text-purple-100",
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="artifact-modal-title"
        className={`relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${className}`}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        data-testid="modal-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex-1 min-w-0 pr-4">
            <h2
              id="artifact-modal-title"
              className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate"
            >
              {artifact?.name || "Artifact Preview"}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              {dataState === "loading" && "Loading artifact preview..."}
              {dataState === "error" && "Error loading artifact"}
              {dataState === "success" && artifact && `${artifact.type} artifact • ${formatSize(artifact.size)}`}
            </p>
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {dataState === "success" && artifact && (
              <>
                <button
                  onClick={handleCopy}
                  disabled={copyStatus !== "idle"}
                  className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                  aria-label="Copy artifact content to clipboard"
                  title="Copy to clipboard"
                >
                  {copyStatus === "copied" ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : copyStatus === "failed" ? (
                    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
                
                <button
                  onClick={handleDownload}
                  className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                  aria-label="Download artifact content"
                  title="Download as text file"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </>
            )}
            
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              aria-label="Close artifact preview"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {dataState === "loading" && (
            <div className="p-6">
              <ArtifactPreviewSkeleton />
            </div>
          )}

          {dataState === "error" && (
            <ArtifactPreviewError onRetry={onRetry} errorMessage={errorMessage} />
          )}

          {dataState === "success" && artifact && (
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Metadata section */}
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${typeBadgeColors[artifact.type] ?? "bg-zinc-600 text-zinc-100"}`}>
                    {artifact.type}
                  </span>
                  <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full text-sm">
                    {formatSize(artifact.size)}
                  </span>
                  <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full text-sm">
                    {formatDate(artifact.updatedAt)}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {artifact.content_hash && (
                    <div>
                      <span className="text-zinc-600 dark:text-zinc-400">Hash:</span>
                      <span className="ml-2 font-mono text-zinc-900 dark:text-zinc-100">{artifact.content_hash}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-600 dark:text-zinc-400">Run ID:</span>
                    <span className="ml-2 font-mono text-zinc-900 dark:text-zinc-100">
                      {artifact.runId || "No associated run"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Content preview */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide mb-3">
                  Content Preview
                </h3>
                <ArtifactContentPreview artifact={artifact} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ArtifactPreviewModal;