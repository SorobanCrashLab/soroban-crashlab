'use client';

import { useEffect, useState } from 'react';

/**
 * Breakpoint indicator and responsive container component.
 * Provides a visual cue for current screen size in development
 * and ensures layout consistency.
 */
export default function AddResponsiveLayoutImprovements() {
    const [breakpoint, setBreakpoint] = useState<string>('');

    useEffect(() => {
        const updateBreakpoint = () => {
            const width = window.innerWidth;
            if (width < 640) setBreakpoint('xs (Mobile)');
            else if (width < 768) setBreakpoint('sm (Small Tablet)');
            else if (width < 1024) setBreakpoint('md (Tablet)');
            else if (width < 1280) setBreakpoint('lg (Desktop)');
            else setBreakpoint('xl+ (Large Screen)');
        };

        updateBreakpoint();
        window.addEventListener('resize', updateBreakpoint);
        return () => window.removeEventListener('resize', updateBreakpoint);
    }, []);

    // Only show the indicator in development/maintained environments (mocked here)
    const showIndicator = process.env.NODE_ENV === 'development' || true;

    return (
        <>
            {showIndicator && (
                <div 
                    className="fixed bottom-4 left-4 z-50 px-2 py-1 bg-zinc-800 text-zinc-100 text-[10px] font-mono rounded-md opacity-50 hover:opacity-100 transition-opacity pointer-events-none sm:pointer-events-auto"
                    aria-hidden="true"
                >
                    BR: {breakpoint}
                </div>
            )}
            
            {/* Global responsive styles/overrides could be injected here if needed via a style tag or container utility */}
            <style jsx global>{`
                @media (max-width: 640px) {
                    .responsive-container {
                        padding-left: 1rem !important;
                        padding-right: 1rem !important;
                    }
                    .hero-title {
                        font-size: 2.25rem !important; /* 36px */
                        line-height: 2.5rem !important;
                    }
                }
            `}</style>
        </>
    );
}
