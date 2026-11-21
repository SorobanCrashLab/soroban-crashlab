// WIP scaffold for issue #2274. Revoke/rotate actions and access analytics display pending.
"use client";

import { useShareLinks } from "./hooks/useShareLinks";

export function ShareLinksManager() {
  const { links, isLoading } = useShareLinks();

  if (isLoading) {
    return <div role="status">Loading share links…</div>;
  }

  return (
    <ul aria-label="Share links" className="share-links-manager">
      {links.map((link) => (
        <li key={link.token}>
          {link.entityType}/{link.entityId} — {link.revoked ? "revoked" : "active"}
        </li>
      ))}
    </ul>
  );
}
