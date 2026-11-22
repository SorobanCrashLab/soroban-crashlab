// WIP scaffold for issue #2285. Saved request collections not implemented yet.
"use client";

export interface RequestCollection {
  id: string;
  name: string;
  requestCount: number;
}

export function Collections({ collections }: { collections: RequestCollection[] }) {
  return (
    <ul aria-label="Saved request collections" className="api-collections">
      {collections.map((collection) => (
        <li key={collection.id}>
          {collection.name} ({collection.requestCount})
        </li>
      ))}
    </ul>
  );
}
