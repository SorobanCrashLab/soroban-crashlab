import React from 'react';

export type EmptyStateIllustrationVariant = 'runs' | 'logs' | 'artifacts' | 'generic';
export type EmptyStateIllustrationSize = 'sm' | 'md' | 'lg';

export interface EmptyStateIllustrationProps {
  variant?: EmptyStateIllustrationVariant;
  size?: EmptyStateIllustrationSize;
  className?: string;
  'aria-label'?: string;
}

const sizeDimensions: Record<EmptyStateIllustrationSize, { width: number; height: number }> = {
  sm: { width: 120, height: 96 },
  md: { width: 180, height: 144 },
  lg: { width: 240, height: 192 },
};

export function EmptyStateIllustration({
  variant = 'generic',
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}: EmptyStateIllustrationProps) {
  const { width, height } = sizeDimensions[size];
  const label = ariaLabel || `${variant} empty state illustration`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`inline-flex items-center justify-center select-none ${className}`}
    >
      {variant === 'runs' && <RunsIllustration width={width} height={height} />}
      {variant === 'logs' && <LogsIllustration width={width} height={height} />}
      {variant === 'artifacts' && <ArtifactsIllustration width={width} height={height} />}
      {variant === 'generic' && <GenericIllustration width={width} height={height} />}
    </div>
  );
}

/**
 * Runs Illustration: Fuzzing execution pipeline, test telemetry nodes, and radar pulse.
 */
function RunsIllustration({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-full"
    >
      <defs>
        <radialGradient id="runs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0A66C2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="runs-primary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A66C2" />
          <stop offset="100%" stopColor="#004182" />
        </linearGradient>
        <linearGradient id="runs-accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5AA7F0" />
          <stop offset="100%" stopColor="#0A66C2" />
        </linearGradient>
        <filter id="runs-shadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.1" floodColor="#0A66C2" />
        </filter>
      </defs>

      {/* Background radial halo */}
      <circle cx="90" cy="72" r="64" fill="url(#runs-glow)" />

      {/* Subtle outer track rings */}
      <circle
        cx="90"
        cy="72"
        r="54"
        className="stroke-zinc-200 dark:stroke-zinc-800"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <circle
        cx="90"
        cy="72"
        r="38"
        className="stroke-zinc-300 dark:stroke-zinc-700/60"
        strokeWidth="1"
      />

      {/* Central Pipeline Hub Card */}
      <g filter="url(#runs-shadow)">
        <rect
          x="54"
          y="42"
          width="72"
          height="60"
          rx="12"
          className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1.5"
        />
      </g>

      {/* Mini top bar on card */}
      <rect
        x="54"
        y="42"
        width="72"
        height="16"
        rx="12"
        className="fill-zinc-50 dark:fill-zinc-800/80 stroke-zinc-200 dark:stroke-zinc-800"
        strokeWidth="1.5"
      />
      <circle cx="64" cy="50" r="2" fill="#CC1016" />
      <circle cx="71" cy="50" r="2" fill="#946210" />
      <circle cx="78" cy="50" r="2" fill="#057642" />

      {/* Play / Rocket / Execution Arrow in Center */}
      <path
        d="M84 66L98 74L84 82V66Z"
        fill="url(#runs-primary)"
      />
      <circle cx="84" cy="66" r="1.5" fill="#5AA7F0" />
      <circle cx="98" cy="74" r="1.5" fill="#5AA7F0" />
      <circle cx="84" cy="82" r="1.5" fill="#5AA7F0" />

      {/* Left Node (Queued) */}
      <circle
        cx="26"
        cy="72"
        r="12"
        className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700"
        strokeWidth="1.5"
      />
      <path
        d="M26 67V72L29 74"
        className="stroke-zinc-400 dark:stroke-zinc-500"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Connecting line left */}
      <path
        d="M38 72H54"
        className="stroke-zinc-300 dark:stroke-zinc-700"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />

      {/* Right Node (Completed / Target) */}
      <circle
        cx="154"
        cy="72"
        r="12"
        className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700"
        strokeWidth="1.5"
      />
      <path
        d="M149 72L153 76L159 68"
        stroke="#057642"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Connecting line right */}
      <path
        d="M126 72H142"
        className="stroke-zinc-300 dark:stroke-zinc-700"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />

      {/* Floating Sparkles / Accents */}
      <path
        d="M48 28L50 34L56 36L50 38L48 44L46 38L40 36L46 34L48 28Z"
        fill="#0A66C2"
        opacity="0.6"
      />
      <circle cx="138" cy="32" r="3" fill="#5AA7F0" opacity="0.7" />
      <circle cx="130" cy="116" r="2.5" className="fill-zinc-300 dark:fill-zinc-700" />
      <circle cx="44" cy="112" r="2" className="fill-zinc-300 dark:fill-zinc-700" />
    </svg>
  );
}

/**
 * Logs Illustration: Structured log viewer terminal, log lines, and search inspector.
 */
function LogsIllustration({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-full"
    >
      <defs>
        <radialGradient id="logs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#0A66C2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="logs-terminal-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5AA7F0" stopOpacity="0.1" />
        </linearGradient>
        <filter id="logs-shadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.12" floodColor="#000000" />
        </filter>
      </defs>

      {/* Ambient glow */}
      <circle cx="90" cy="72" r="62" fill="url(#logs-glow)" />

      {/* Terminal Main Window */}
      <g filter="url(#logs-shadow)">
        <rect
          x="32"
          y="28"
          width="116"
          height="88"
          rx="10"
          className="fill-white dark:fill-[#0c0c0c] stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1.5"
        />
      </g>

      {/* Terminal Header Bar */}
      <path
        d="M32 38C32 32.4772 36.4772 28 42 28H138C143.523 28 148 32.4772 148 38V44H32V38Z"
        className="fill-zinc-50 dark:fill-zinc-900 border-b stroke-zinc-200 dark:stroke-zinc-800"
        strokeWidth="1"
      />
      <circle cx="44" cy="36" r="2.5" fill="#CC1016" opacity="0.8" />
      <circle cx="52" cy="36" r="2.5" fill="#946210" opacity="0.8" />
      <circle cx="60" cy="36" r="2.5" fill="#057642" opacity="0.8" />
      <rect x="74" y="33" width="32" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-800" />

      {/* Structured Log Lines */}
      {/* Row 1: INFO */}
      <rect x="42" y="52" width="14" height="6" rx="2" fill="#0A66C2" fillOpacity="0.15" />
      <rect x="44" y="54" width="10" height="2" rx="1" fill="#0A66C2" />
      <rect x="60" y="54" width="22" height="3" rx="1.5" className="fill-zinc-300 dark:fill-zinc-700" />
      <rect x="86" y="54" width="46" height="3" rx="1.5" className="fill-zinc-200 dark:fill-zinc-800" />

      {/* Row 2: WARN */}
      <rect x="42" y="64" width="14" height="6" rx="2" fill="#946210" fillOpacity="0.15" />
      <rect x="44" y="66" width="10" height="2" rx="1" fill="#946210" />
      <rect x="60" y="66" width="18" height="3" rx="1.5" className="fill-zinc-300 dark:fill-zinc-700" />
      <rect x="82" y="66" width="40" height="3" rx="1.5" className="fill-zinc-200 dark:fill-zinc-800" />

      {/* Row 3: SUCCESS */}
      <rect x="42" y="76" width="14" height="6" rx="2" fill="#057642" fillOpacity="0.15" />
      <rect x="44" y="78" width="10" height="2" rx="1" fill="#057642" />
      <rect x="60" y="78" width="26" height="3" rx="1.5" className="fill-zinc-300 dark:fill-zinc-700" />
      <rect x="90" y="78" width="34" height="3" rx="1.5" className="fill-zinc-200 dark:fill-zinc-800" />

      {/* Row 4: Terminal Prompt */}
      <text
        x="42"
        y="96"
        className="fill-[#0A66C2] dark:fill-[#5AA7F0] font-mono text-[9px] font-bold"
      >
        &gt;
      </text>
      <rect
        x="50"
        y="90"
        width="2"
        height="7"
        rx="1"
        className="fill-[#0A66C2] dark:fill-[#5AA7F0] animate-pulse"
      />
      <rect x="56" y="92" width="28" height="3" rx="1.5" className="fill-zinc-300 dark:fill-zinc-700" />

      {/* Search Magnifier Badge overlay */}
      <g filter="url(#logs-shadow)">
        <circle
          cx="134"
          cy="98"
          r="16"
          className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700"
          strokeWidth="1.5"
        />
        <circle
          cx="132"
          cy="96"
          r="6.5"
          className="stroke-[#0A66C2] dark:stroke-[#5AA7F0]"
          strokeWidth="1.5"
        />
        <path
          d="M137 101L142 106"
          className="stroke-[#0A66C2] dark:stroke-[#5AA7F0]"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * Artifacts Illustration: Isometric archive container, storage vault, and floating artifact files.
 */
function ArtifactsIllustration({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-full"
    >
      <defs>
        <radialGradient id="art-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0A66C2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="art-box-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A66C2" />
          <stop offset="100%" stopColor="#004182" />
        </linearGradient>
        <filter id="art-shadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodOpacity="0.1" floodColor="#0A66C2" />
        </filter>
      </defs>

      {/* Radial glow */}
      <circle cx="90" cy="74" r="60" fill="url(#art-glow)" />

      {/* Bottom shadow base */}
      <ellipse cx="90" cy="118" rx="48" ry="10" className="fill-zinc-200/80 dark:fill-zinc-800/60" />

      {/* Floating Artifact Document 1: Crash dump (Left) */}
      <g transform="rotate(-8 60 55)">
        <rect
          x="44"
          y="32"
          width="32"
          height="42"
          rx="5"
          className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700"
          strokeWidth="1.2"
        />
        {/* Folded corner */}
        <path d="M68 32V38H76" className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
        <rect x="49" y="42" width="16" height="2.5" rx="1" fill="#CC1016" fillOpacity="0.8" />
        <rect x="49" y="48" width="22" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="49" y="53" width="18" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="49" y="58" width="14" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
      </g>

      {/* Floating Artifact Document 2: Seed / WASM (Right) */}
      <g transform="rotate(10 120 50)">
        <rect
          x="104"
          y="28"
          width="32"
          height="42"
          rx="5"
          className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700"
          strokeWidth="1.2"
        />
        <path d="M128 28V34H136" className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
        <rect x="109" y="38" width="16" height="2.5" rx="1" fill="#946210" fillOpacity="0.8" />
        <rect x="109" y="44" width="22" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="109" y="49" width="16" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="109" y="54" width="20" height="2" rx="1" className="fill-zinc-200 dark:fill-zinc-700" />
      </g>

      {/* Main Storage Vault / Box Front */}
      <g filter="url(#art-shadow)">
        {/* Box Base */}
        <path
          d="M52 74L90 60L128 74L90 88L52 74Z"
          className="fill-zinc-100 dark:fill-zinc-800 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1.2"
        />
        <path
          d="M52 74V102L90 116V88L52 74Z"
          className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1.2"
        />
        <path
          d="M128 74V102L90 116V88L128 74Z"
          className="fill-zinc-50 dark:fill-zinc-950 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1.2"
        />

        {/* Box Lid / Flaps Open */}
        <path
          d="M52 74L36 62L74 52L90 60L52 74Z"
          className="fill-zinc-200/90 dark:fill-zinc-800/90 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1"
        />
        <path
          d="M128 74L144 62L106 52L90 60L128 74Z"
          className="fill-zinc-200/90 dark:fill-zinc-800/90 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1"
        />

        {/* Soroban Emblem on front of box */}
        <circle cx="90" cy="102" r="7" fill="url(#art-box-grad)" />
        <path
          d="M90 98L92 101H95L92.5 103L93.5 106L90 104L86.5 106L87.5 103L85 101H88L90 98Z"
          fill="#FFFFFF"
        />
      </g>

      {/* Floating Data Sparks */}
      <circle cx="38" cy="46" r="2.5" fill="#0A66C2" opacity="0.7" />
      <circle cx="146" cy="40" r="2" fill="#5AA7F0" opacity="0.8" />
      <path
        d="M90 22L92 26L96 28L92 30L90 34L88 30L84 28L88 26L90 22Z"
        fill="#0A66C2"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * Generic Empty State Illustration: Clean empty folder with dashed accents.
 */
function GenericIllustration({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-full"
    >
      <defs>
        <radialGradient id="generic-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#0A66C2" stopOpacity="0" />
        </radialGradient>
        <filter id="generic-shadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodOpacity="0.08" floodColor="#000000" />
        </filter>
      </defs>

      <circle cx="90" cy="72" r="58" fill="url(#generic-glow)" />

      {/* Background folder tab & body */}
      <g filter="url(#generic-shadow)">
        <path
          d="M46 44C46 40.6863 48.6863 38 52 38H76L86 46H128C131.314 46 134 48.6863 134 52V62H46V44Z"
          className="fill-zinc-100 dark:fill-zinc-800 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1.5"
        />
        {/* Front folder flap */}
        <path
          d="M42 62H138L132 108C131.5 111.5 128.5 114 125 114H55C51.5 114 48.5 111.5 48 108L42 62Z"
          className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth="1.5"
        />
      </g>

      {/* Center dash / empty marker */}
      <rect
        x="76"
        y="84"
        width="28"
        height="4"
        rx="2"
        className="fill-zinc-300 dark:fill-zinc-700"
      />
      <circle cx="90" cy="54" r="2.5" fill="#0A66C2" opacity="0.6" />

      {/* Sparkle accents */}
      <path
        d="M136 34L137.5 38.5L142 40L137.5 41.5L136 46L134.5 41.5L130 40L134.5 38.5L136 34Z"
        fill="#0A66C2"
        opacity="0.6"
      />
      <circle cx="48" cy="30" r="2" fill="#5AA7F0" opacity="0.7" />
    </svg>
  );
}
