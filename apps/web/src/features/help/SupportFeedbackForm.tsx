// WIP scaffold for issue #2281. Diagnostic bundle attachment and privacy controls not
// implemented yet — submits message text only.
"use client";

import { useState } from "react";

export function SupportFeedbackForm({
  onSubmit,
}: {
  onSubmit: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  return (
    <form
      aria-label="Support feedback form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(message);
      }}
    >
      <textarea
        aria-label="Feedback message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button type="submit">Send feedback</button>
    </form>
  );
}
