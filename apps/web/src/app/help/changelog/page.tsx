// WIP scaffold for issue #2281. Not wired to real release-notes data or filters yet.
import { WhatsNew } from "@/features/help/WhatsNew";

export const dynamic = "force-dynamic";

export default function HelpChangelogPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">What's new (WIP)</h1>
      <WhatsNew announcements={[]} />
    </div>
  );
}
