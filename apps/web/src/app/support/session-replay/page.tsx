import type { Metadata } from 'next';
import { SessionReplayIndex } from '@/features/session-replay/SessionReplayIndex';

export const metadata: Metadata = {
  title: 'Session replay | Soroban CrashLab',
  description: 'Privacy-aware session replays, journey funnels and reproduction bundles for frontend debugging.',
};

export const dynamic = 'force-dynamic';

/** /support/session-replay (#2341) */
export default function SessionReplayPage() {
  return <SessionReplayIndex />;
}
