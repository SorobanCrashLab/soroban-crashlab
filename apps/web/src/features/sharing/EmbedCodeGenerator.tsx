// WIP scaffold for issue #2274. Theme/auto-resize params and script-embed variant pending.
"use client";

export function generateIframeEmbed(token: string, baseUrl: string): string {
  return `<iframe src="${baseUrl}/share/embed/${token}" width="100%" height="480" frameborder="0" sandbox="allow-scripts"></iframe>`;
}

export function EmbedCodeGenerator({ token, baseUrl }: { token: string; baseUrl: string }) {
  return <pre aria-label="Embed code">{generateIframeEmbed(token, baseUrl)}</pre>;
}
