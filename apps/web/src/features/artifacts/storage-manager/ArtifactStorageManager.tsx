'use client';

/**
 * Artifact Storage & Provenance Manager (#2342): explorer, retention and
 * holds behind accessible tabs, with the detail panels beside the explorer.
 */

import { useState } from 'react';
import { AccessibleTabs } from '@/components/AccessibleTabs';
import { ArtifactExplorer } from './ArtifactExplorer';
import { ArtifactMetadataPanel } from './ArtifactMetadataPanel';
import { HoldsManager } from './HoldsManager';
import { IntegrityStatusPanel } from './IntegrityStatusPanel';
import { ProvenanceLineage } from './ProvenanceLineage';
import { RetentionPolicyManager } from './RetentionPolicyManager';
import { useArtifactManager } from './hooks/useArtifactManager';
import { permissionExplanation } from './lib/permissions';

type Tab = 'explorer' | 'retention' | 'holds';

export default function ArtifactStorageManager() {
  const state = useArtifactManager();
  const [tab, setTab] = useState<Tab>('explorer');
  const activeHolds = state.holds.data?.holds.filter((hold) => hold.active).length;
  const pending = state.retention.data?.deletions.filter((request) => request.status === 'pending').length;

  return (
    <div className="container-full page-padding fade-in flex flex-col gap-4">
      <header>
        <h1 className="heading-page">Artifact Storage &amp; Provenance</h1>
        <p className="text-meta mt-1">
          Browse, verify and govern artifacts across local, S3 and MinIO backends.
          {state.viewer ? ` ${permissionExplanation(state.viewer.role)}` : ''}
        </p>
      </header>

      {state.notice ? (
        <p className={state.notice.kind === 'error' ? 'field-error text-sm' : 'text-sm'} role={state.notice.kind === 'error' ? 'alert' : 'status'}>
          {state.notice.text}{' '}
          <button type="button" className="btn-ghost text-xs" onClick={state.dismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      <AccessibleTabs
        label="Artifact manager sections"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { id: 'explorer', label: 'Explorer' },
          { id: 'retention', label: 'Retention', badge: pending ? pending : undefined },
          { id: 'holds', label: 'Holds', badge: activeHolds ? activeHolds : undefined },
        ]}
      >
        {tab === 'explorer' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <ArtifactExplorer state={state} />
            <div className="flex flex-col gap-4 min-w-0">
              <ArtifactMetadataPanel state={state} />
              <IntegrityStatusPanel state={state} />
              <ProvenanceLineage state={state} />
            </div>
          </div>
        ) : null}
        {tab === 'retention' ? <RetentionPolicyManager state={state} /> : null}
        {tab === 'holds' ? <HoldsManager state={state} /> : null}
      </AccessibleTabs>
    </div>
  );
}
