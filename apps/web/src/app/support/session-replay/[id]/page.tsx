import type { Metadata } from 'next';
import { SessionReplayViewer } from '@/features/session-replay/SessionReplayViewer';

export const metadata: Metadata = {
  title: 'Session replay | Soroban CrashLab',
  description: 'Replay a session with timeline, network, error and journey context.',
  // Share links carry a token in the URL; never let them be indexed.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

interface SessionReplayDetailProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}

/** /support/session-replay/[id] (#2341). `?share=` carries a time-bounded share token. */
export default async function SessionReplayDetailPage({ params, searchParams }: SessionReplayDetailProps) {
  const { id } = await params;
  const { share } = await searchParams;
  return <SessionReplayViewer id={decodeURIComponent(id)} shareToken={share ?? null} />;
}
