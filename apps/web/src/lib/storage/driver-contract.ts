/**
 * Shared contract suite for `StorageDriver` implementations (#1433).
 *
 * Every driver must satisfy exactly these behaviours. Keeping the suite in one
 * place is what makes "second implementation" a safe claim: the S3 driver is
 * held to the same statements the in-memory default already passes, and the
 * same suite runs against a real MinIO container in CI.
 */

import { describe, expect, it } from 'vitest';
import {
  MULTIPART_THRESHOLD_BYTES,
  StorageError,
  type StorageDriver,
} from './driver';

export interface ContractHarness {
  driver: StorageDriver;
  /**
   * Places an object so `exists`/`createDownloadTicket` have something to find.
   * Real backends upload through the ticket; fakes can record directly.
   */
  seed(key: string, sizeBytes: number): Promise<void>;
}

export function runStorageDriverContract(
  name: string,
  createHarness: () => Promise<ContractHarness> | ContractHarness,
): void {
  describe(`StorageDriver contract: ${name}`, () => {
    it('issues a single-PUT upload ticket for a small artifact', async () => {
      const { driver } = await createHarness();
      const ticket = await driver.createUploadTicket('runs/run-1/artifact.zip', {
        sizeBytes: 1024,
      });

      expect(ticket.kind).toBe('single');
      expect(ticket.key).toBe('runs/run-1/artifact.zip');
      if (ticket.kind !== 'single') return;
      expect(ticket.method).toBe('PUT');
      expect(ticket.url).toMatch(/^https?:\/\//);
      expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(0);
    });

    it('switches to multipart above the 50MB threshold', async () => {
      const { driver } = await createHarness();
      const ticket = await driver.createUploadTicket('runs/run-1/big.zip', {
        sizeBytes: MULTIPART_THRESHOLD_BYTES + 1,
      });

      expect(ticket.kind).toBe('multipart');
      if (ticket.kind !== 'multipart') return;
      expect(ticket.parts.length).toBeGreaterThan(1);
      expect(ticket.parts[0].partNumber).toBe(1);
      // Part numbers are contiguous and every part carries its own signed URL.
      expect(ticket.parts.map((part) => part.partNumber)).toEqual(
        ticket.parts.map((_, index) => index + 1),
      );
      expect(new Set(ticket.parts.map((part) => part.url)).size).toBe(ticket.parts.length);
    });

    it('stays single-PUT exactly at the threshold', async () => {
      const { driver } = await createHarness();
      const ticket = await driver.createUploadTicket('runs/run-1/edge.zip', {
        sizeBytes: MULTIPART_THRESHOLD_BYTES,
      });
      expect(ticket.kind).toBe('single');
    });

    it('reports existence for a stored object and absence otherwise', async () => {
      const harness = await createHarness();
      await harness.seed('runs/run-2/present.zip', 10);

      expect(await harness.driver.exists('runs/run-2/present.zip')).toBe(true);
      expect(await harness.driver.exists('runs/run-2/absent.zip')).toBe(false);
    });

    it('issues a download ticket for a stored object', async () => {
      const harness = await createHarness();
      await harness.seed('runs/run-3/artifact.zip', 10);

      const ticket = await harness.driver.createDownloadTicket('runs/run-3/artifact.zip');
      expect(ticket.method).toBe('GET');
      expect(ticket.url).toMatch(/^https?:\/\//);
    });

    it('deletes an object and is idempotent about it', async () => {
      const harness = await createHarness();
      await harness.seed('runs/run-4/artifact.zip', 10);

      await harness.driver.delete('runs/run-4/artifact.zip');
      expect(await harness.driver.exists('runs/run-4/artifact.zip')).toBe(false);
      // Deleting again must not throw.
      await harness.driver.delete('runs/run-4/artifact.zip');
    });

    it('rejects an empty key as a permanent failure', async () => {
      const { driver } = await createHarness();
      await expect(driver.createUploadTicket('  ', { sizeBytes: 1 })).rejects.toMatchObject({
        name: 'StorageError',
        kind: 'permanent',
      });
    });

    it('never leaks the secret access key into a ticket URL', async () => {
      const { driver } = await createHarness();
      const ticket = await driver.createUploadTicket('runs/run-5/artifact.zip', { sizeBytes: 1 });
      const url = ticket.kind === 'single' ? ticket.url : ticket.parts[0].url;
      expect(url).not.toMatch(/secret/i);
    });

    it('exposes a stable driver name', async () => {
      const { driver } = await createHarness();
      expect(typeof driver.name).toBe('string');
      expect(driver.name.length).toBeGreaterThan(0);
    });
  });
}

/** Re-exported so contract consumers can assert on the error type. */
export { StorageError };
