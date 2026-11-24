/*
 * ReproducerManager — #2300 (issue/079-frontend-golden-reproducers-fixtures-manager)
 * Phase 1 scaffold: catalog of candidate and golden reproducers/fixtures
 * with rich metadata and provenance (#021/#061).
 */

import type { FixtureProvenance } from '@/lib/reproducers/provenance';

export default function ReproducerManager({ provenance }: { provenance: FixtureProvenance[] }) {
  return (
    <main>
      <h1>Reproducers &amp; fixtures</h1>
      <p>{provenance.length} record(s)</p>
    </main>
  );
}
