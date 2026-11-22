import type { Metadata } from 'next';
import { StorageLayoutExplorer } from '@/features/storage-explorer/StorageLayoutExplorer';
import type { StorageSnapshot } from '@/features/storage-explorer/model';

export const metadata: Metadata = {
  title: 'Contract storage explorer | Soroban CrashLab',
  description: 'Typed storage layout, keyspace heatmap, access patterns and snapshot diffs.',
};
export const dynamic = 'force-dynamic';

interface StoragePageProps {
  params: Promise<{ id: string }>;
}

const samples: StorageSnapshot[] = [
  {
    id: 'snap-120', contractId: 'demo', campaignId: null, ledger: 120,
    capturedAt: '2026-01-02T00:00:00Z',
    entries: [
      {
        key: 'balances:alice', storageClass: 'persistent', namespace: 'token', owner: 'CALICE',
        raw: '500', decodedType: 'u64', decodedValue: '500', valueBytes: 64,
        reads: 80, writes: 5, lastAccessLedger: 120, ttlLedger: null,
        sensitive: false, confidence: 0.9,
      },
      {
        key: 'admin', storageClass: 'instance', namespace: 'access', owner: 'CADMIN',
        raw: 'C' + 'A'.repeat(55), decodedType: 'address', decodedValue: 'C' + 'A'.repeat(55),
        valueBytes: 32, reads: 20, writes: 1, lastAccessLedger: 118, ttlLedger: null,
        sensitive: false, confidence: 0.85,
      },
      {
        key: 'oracle:price', storageClass: 'temporary', namespace: 'price', owner: 'CORACLE',
        raw: 'sk_live_example123', decodedType: 'unknown', decodedValue: 'sk_live_example123',
        valueBytes: 16, reads: 3, writes: 3, lastAccessLedger: 119, ttlLedger: 100,
        sensitive: true, confidence: 0.2,
      },
    ],
  },
];

export default async function ContractStoragePage({ params }: StoragePageProps) {
  const { id } = await params;
  return (
    <div className="container-full page-padding fade-in">
      <h1 id="storage-explorer-heading" className="heading-page">Storage layout · {id}</h1>
      <p className="text-meta mt-1 mb-6 max-w-3xl">
        Typed keyspace tree, access heatmap, anomaly detection and snapshot diff for contract {id}.
      </p>
      <StorageLayoutExplorer snapshots={samples} currentLedger={120} />
    </div>
  );
}
