// WIP scaffold for issue #2275. Thin list focused on usage/incident surfacing; the primary
// create/list/rotate/revoke UI already exists in ApiTokenManager.tsx.
"use client";

import type { TokenDetailsData } from "./TokenDetails";

export function TokenList({
  tokens,
  onSelect,
}: {
  tokens: TokenDetailsData[];
  onSelect: (token: TokenDetailsData) => void;
}) {
  return (
    <ul aria-label="Access tokens" className="token-list">
      {tokens.map((token) => (
        <li key={token.id}>
          <button type="button" onClick={() => onSelect(token)}>
            {token.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
