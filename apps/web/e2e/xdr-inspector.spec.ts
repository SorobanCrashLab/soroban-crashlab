import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('crashlab:onboarding-wizard-complete:v1', 'true'),
  );
  const response = await page.goto('/xdr-inspector');
  expect(response?.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  await expect(
    page.getByRole('heading', { name: 'XDR / ScVal Inspector', exact: true }),
  ).toBeVisible();
});

test('worker edits are atomic; raw selection, diff and exports agree', async ({ page }) => {
  await page.getByRole('button', { name: 'Decode A', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'XDR payload' });
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await tree.getByRole('treeitem').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem').nth(1)).toBeFocused();
  await expect(page.getByLabel('Typed node JSON', { exact: true })).toHaveValue(/"value": 7/);
  await page.getByLabel('Typed node JSON', { exact: true }).fill('{"kind":"scalar","value":-1}');
  await page.getByRole('button', { name: 'Validate and re-encode', exact: true }).click();
  await expect(page.getByTestId('xdr-inspector').getByRole('alert')).toContainText(
    'Invalid UnsignedInt',
  );
  await page.getByLabel('Typed node JSON', { exact: true }).fill('{"kind":"scalar","value":9}');
  await page.getByRole('button', { name: 'Validate and re-encode', exact: true }).click();
  await expect(page.getByText('Edit accepted.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Raw hexadecimal preview')).toContainText('00 00 00 09');
  await page.getByLabel('Raw byte offset').fill('7');
  await page.getByRole('button', { name: 'Select byte', exact: true }).click();
  await expect(page.getByText('Path: /value', { exact: true })).toBeVisible();
  await page.getByLabel('Payload B', { exact: true }).fill('AAAAAwAAAAc=');
  await page.getByRole('button', { name: 'Load B and compare', exact: true }).click();
  await expect(page.getByText('1 differing byte positions', { exact: false })).toBeVisible();
  const redactedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export payload', exact: true }).click();
  const redacted = JSON.parse(await readFile((await (await redactedDownload).path())!, 'utf8'));
  expect(redacted.redacted).toBe(true);
  expect(redacted.document.value.value).toBeNull();
  await page.getByRole('checkbox', { name: /Redact every payload leaf/ }).uncheck();
  await page.getByLabel('Export format', { exact: true }).selectOption('base64');
  const exactDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export payload', exact: true }).click();
  expect(await readFile((await (await exactDownload).path())!, 'utf8')).toBe('AAAAAwAAAAk=');
  const violations = (
    await new AxeBuilder({ page })
      .include('[data-testid="xdr-inspector"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.addStyleTag({
    content: '*,*::before,*::after { transition: none !important; animation: none !important; }',
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include('[data-testid="xdr-inspector"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('5 MiB file stays off the UI thread with bounded tree and raw DOM', async ({ page }) => {
  const bytes = Buffer.alloc(5 * 1024 * 1024, 65);
  bytes.writeUInt32BE(13, 0); // SCV_BYTES
  bytes.writeUInt32BE(bytes.length - 8, 4);
  await page.getByLabel('Import payload A', { exact: true }).setInputFiles({
    name: 'large.base64',
    mimeType: 'text/plain',
    buffer: Buffer.from(bytes.toString('base64')),
  });
  await page.evaluate(() => {
    (window as unknown as { xdrTicks: number }).xdrTicks = 0;
    const timer = setInterval(() => {
      (window as unknown as { xdrTicks: number }).xdrTicks++;
    }, 10);
    setTimeout(() => clearInterval(timer), 10000);
  });
  await page.getByRole('button', { name: 'Decode A', exact: true }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  expect(
    await page.evaluate(() => (window as unknown as { xdrTicks: number }).xdrTicks),
  ).toBeGreaterThan(0);
  await expect(page.getByText('5,242,880 bytes', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Typed node JSON', { exact: true })).toHaveCount(0);
  expect(
    await page.getByLabel('Raw hexadecimal preview').getByRole('button').count(),
  ).toBeLessThanOrEqual(64);
  await page.getByLabel('Raw byte offset').fill(String(bytes.length - 1));
  await page.getByRole('button', { name: 'Select byte', exact: true }).click();
  await expect(page.getByText('Path: /value', { exact: true })).toBeVisible();
});

test('unknown variants retain a read-only raw preview', async ({ page }) => {
  await page.getByLabel('Input encoding', { exact: true }).selectOption('hex');
  await page.getByLabel('Payload A', { exact: true }).fill('7fffffff');
  await page.getByRole('button', { name: 'Decode A', exact: true }).click();
  await expect(page.getByTestId('xdr-inspector').getByRole('alert')).toContainText('read-only');
  await expect(page.getByLabel('Raw hexadecimal preview')).toContainText('7f ff ff ff');
  await expect(
    page.getByRole('button', { name: 'Validate and re-encode', exact: true }),
  ).toHaveCount(0);
});

test('run/artifact bookmark restores a node after authorized local decode', async ({ page }) => {
  await page.goto('/runs/run-1000/payloads?artifact=art-001&context=trace#node=%2Fvalue');
  await expect(
    page.getByText('Context: Run run-1000 | artifact art-001 | trace', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to run', exact: true })).toHaveAttribute(
    'href',
    '/runs/run-1000',
  );
  await page.getByRole('button', { name: 'Decode A', exact: true }).click();
  await expect(page.getByText('Path: /value', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Typed node JSON', { exact: true })).toHaveValue(/"value": 7/);
});
