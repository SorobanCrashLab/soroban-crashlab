import Link from 'next/link';
import { triageStore } from '@/lib/triage/store';
import { buildTriageSeed } from '@/lib/triage/seed';
import TriageQueueClient from './TriageQueueClient';

export const dynamic = 'force-dynamic';

const ORG_ID = 'default';

/**
 * Persisted triage queue (#1878).
 *
 * The page reads the durable store rather than the fixture array, so status and
 * ownership survive a reload. The default org is seeded on first visit, and
 * seeding is idempotent: an existing assignment is never overwritten.
 */
export default async function TriageQueuePage() {
  await triageStore.seed(buildTriageSeed(ORG_ID));
  const items = await triageStore.list(ORG_ID);

  // The API audits every mutation, and the audit log requires an actor. A real
  // deployment resolves this from the session; the env override keeps local and
  // preview deployments attributable instead of anonymous.
  const actor = process.env.CRASHLAB_TRIAGE_ACTOR?.trim() || 'maintainer';

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Triage workflow
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">Triage queue</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Assign ownership, move items through the workflow, and select several rows for a batch action.
          Every accepted change is audit-stamped with who made it and what the row looked like before.
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Prefer the board view?{' '}
          <Link href="/triage/board" className="font-medium text-indigo-600 dark:text-indigo-400 underline">
            open the swimlane board
          </Link>
          .
        </p>
      </header>

      <TriageQueueClient initialItems={items} orgId={ORG_ID} actor={actor} />
    </main>
  );
}
