// WIP scaffold for issue #2281. Dismiss/read tracking persistence not implemented yet.
"use client";

export interface Announcement {
  id: string;
  title: string;
  publishedAt: string;
}

export function WhatsNew({ announcements }: { announcements: Announcement[] }) {
  return (
    <div aria-label="What's new" className="whats-new">
      {announcements.map((announcement) => (
        <div key={announcement.id}>
          <strong>{announcement.title}</strong>
          <span>{announcement.publishedAt}</span>
        </div>
      ))}
    </div>
  );
}
