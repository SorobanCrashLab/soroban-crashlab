// WIP scaffold for issue #2281. Troubleshooting widget integration with error/integration
// health views is not implemented yet.
"use client";

import { useHelpContext } from "./hooks/useHelpContext";

export function ContextualHelpPanel() {
  const { suggestedSlugs } = useHelpContext();

  return (
    <aside aria-label="Contextual help" className="contextual-help-panel">
      {suggestedSlugs.length === 0 ? (
        <p>No suggested articles for this page yet.</p>
      ) : (
        <ul>
          {suggestedSlugs.map((slug) => (
            <li key={slug}>{slug}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
