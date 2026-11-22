'use client';

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 192 192"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="cl-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A66C2" />
          <stop offset="100%" stopColor="#063A6B" />
        </linearGradient>
        <linearGradient id="cl-flask" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8F0FA" />
        </linearGradient>
      </defs>
      <rect width="192" height="192" rx="36" fill="url(#cl-bg)" />
      <path
        d="M96 26 L155 50 L155 109 C155 140 129 163 96 173 C63 163 37 140 37 109 L37 50 Z"
        fill="white"
      />
      <path
        d="M96 26 L155 50 L155 66 L96 42 L37 66 L37 50 Z"
        fill="#0A66C2"
        opacity={0.06}
      />
      <rect x={74} y={66} width={44} height={11} rx={3.5} fill="white" stroke="#0A66C2" strokeWidth={3.4} />
      <path
        d="M78 77 H114 V132 C114 142.5 105.8 151 96 151 C86.2 151 78 142.5 78 132 Z"
        fill="url(#cl-flask)"
        stroke="#0A66C2"
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
      <path d="M82.5 118.5 H109.5 V132 C109.5 139.8 103.3 145.5 96 145.5 C88.7 145.5 82.5 139.8 82.5 132 Z" fill="#0A66C2" opacity={0.09} />
      <circle cx={89} cy={129} r={3.6} fill="#0A66C2" />
      <circle cx={101.5} cy={123} r={2.6} fill="#0A66C2" opacity={0.72} />
      <circle cx={107} cy={133} r={1.9} fill="#0A66C2" opacity={0.5} />
      <g transform="translate(96 91) scale(1.08)">
        <path
          d="M0 -11.5 L3.35 -3.4 L11.5 -3.4 L5.2 1.7 L7 10.2 L0 5.1 L-7 10.2 L-5.2 1.7 L-11.5 -3.4 L-3.35 -3.4 Z"
          fill="#0A66C2"
        />
      </g>
      <path d="M97 142 L92.2 148.6 L98.4 152.4 L94.6 159.2" stroke="#CC1016" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={96} cy={162.5} r={1.6} fill="#CC1016" opacity={0.95} />
    </svg>
  );
}

export function Logo({ withText = true, size = 32 }: { withText?: boolean; size?: number }) {
  if (!withText) return <LogoMark size={size} />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={size} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          CrashLab
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: -1 }}>
          Soroban
        </span>
      </span>
    </span>
  );
}

export default Logo;
