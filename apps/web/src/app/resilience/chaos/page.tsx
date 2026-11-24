import type { Metadata } from 'next';
import { ChaosControlCenter } from '@/features/chaos/ChaosControlCenter';

export const metadata: Metadata = {
  title: 'Chaos & failure injection | Soroban CrashLab',
  description: 'Design, approve, run, monitor and analyse guarded failure-injection experiments.',
};

export const dynamic = 'force-dynamic';

/** /resilience/chaos (#2340) */
export default function ChaosPage() {
  return <ChaosControlCenter />;
}
