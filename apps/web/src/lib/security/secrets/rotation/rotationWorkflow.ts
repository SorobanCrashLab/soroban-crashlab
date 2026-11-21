export async function rotateSecret(input: {
  tenantId: string;
  integrationId: string;
  name: string;
  overlapMs: number;
}) {
  const previous = await getActiveVersion(input);
  const next = await generateAndStoreNextVersion(input);

  await activateVersion({ ...input, version: next.version });

  await writeSecretAudit({
    ...input,
    action: 'rotate',
    previousVersion: previous.version,
    newVersion: next.version,
  });

  await scheduleVersionRevocation({
    ...input,
    version: previous.version,
    revokeAt: Date.now() + input.overlapMs,
  });

  return { activeVersion: next.version };
}
