/**
 * Triggers a browser file download from a Blob.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser file download from a text/JSON payload.
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'application/json',
): void {
  triggerBrowserDownload(new Blob([content], { type: mimeType }), filename);
}
