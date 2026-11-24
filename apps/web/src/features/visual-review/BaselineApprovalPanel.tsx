/*
 * BaselineApprovalPanel — #2298
 * Phase 3 scaffold: propose, approve or reject baseline updates with rationale
 * and audit trail (#063/#070).
 */

import type { BaselineApproval } from '@/lib/visual-review/governance';

export default function BaselineApprovalPanel({ approvals }: { approvals: BaselineApproval[] }) {
  return (
    <section aria-label="Baseline approval panel">
      {approvals.length} pending baseline change(s)
    </section>
  );
}
