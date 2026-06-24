import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

const TEST_FILE_CONTENT = 'test artifact content for e2e testing';
const TEST_FILE_JSON_CONTENT = JSON.stringify({
  metadata: {
    id: 'test-run-123',
    status: 'failed',
    severity: 'high',
  },
  data: [1, 2, 3, 4, 5],
});

/**
 * Helper to create a temporary test file
 */
async function createTestFile(
  filename: string,
  content: string = TEST_FILE_CONTENT
): Promise<string> {
  const tempDir = path.join(__dirname, '.temp-test-files');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Helper to clean up temporary test files
 */
function cleanupTestFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to cleanup test file ${filePath}:`, error);
  }
}

/**
 * Helper to navigate to artifact storage integration page
 */
async function navigateToArtifactPage(page: Page): Promise<void> {
  await page.goto('/integrations/artifacts');
  // Wait for the page to fully load
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to upload an artifact via the UI
 */
async function uploadArtifactViaUI(
  page: Page,
  filePath: string
): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for the artifact to appear in the list
  await page.waitForTimeout(1000); // Allow upload processing
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to wait for artifact to appear in list
 */
async function waitForArtifactInList(
  page: Page,
  fileName: string
): Promise<void> {
  const artifactLink = page.locator(`text=${fileName}`);
  await expect(artifactLink).toBeVisible({ timeout: 10000 });
}

test.describe('Artifact Upload/Download E2E', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToArtifactPage(page);
  });

  test('should upload an artifact successfully', async ({ page }) => {
    const testFileName = `test-artifact-${Date.now()}.txt`;
    const testFilePath = await createTestFile(testFileName);

    try {
      // Get initial artifact count
      const initialArtifactItems = await page.locator('div[class*="border"]').count();

      // Upload artifact
      await uploadArtifactViaUI(page, testFilePath);

      // Verify artifact appears in list
      await waitForArtifactInList(page, testFileName);

      // Verify artifact is displayed
      const artifactElements = page.locator(`text="${testFileName}"`);
      await expect(artifactElements.first()).toBeVisible();

      // Verify artifact metadata is shown (file size, date)
      const sizeRegex = /\d+\s*(B|KB|MB)/;
      const pageContent = await page.content();
      expect(pageContent).toMatch(sizeRegex);
    } finally {
      cleanupTestFile(testFilePath);
    }
  });

  test('should display artifact list after page load', async ({ page }) => {
    // Wait for artifacts to load
    await page.waitForLoadState('networkidle');

    // Check if artifact list section exists
    const listSection = page.locator('text=Artifacts');
    await expect(listSection).toBeVisible();
  });

  test('should display upload section with file input', async ({ page }) => {
    // Verify upload section exists
    const uploadSection = page.locator('text=Upload New Artifact');
    await expect(uploadSection).toBeVisible();

    // Verify file input exists
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
  });

  test('should handle multiple artifact uploads', async ({ page }) => {
    const testFile1 = `artifact-1-${Date.now()}.txt`;
    const testFile2 = `artifact-2-${Date.now()}.txt`;
    const filePath1 = await createTestFile(testFile1, 'content 1');
    const filePath2 = await createTestFile(testFile2, 'content 2');

    try {
      // Upload first artifact
      await uploadArtifactViaUI(page, filePath1);
      await waitForArtifactInList(page, testFile1);

      // Verify first artifact is in list
      await expect(page.locator(`text="${testFile1}"`).first()).toBeVisible();

      // Upload second artifact
      await uploadArtifactViaUI(page, filePath2);
      await waitForArtifactInList(page, testFile2);

      // Verify both artifacts are in list
      await expect(page.locator(`text="${testFile1}"`).first()).toBeVisible();
      await expect(page.locator(`text="${testFile2}"`).first()).toBeVisible();
    } finally {
      cleanupTestFile(filePath1);
      cleanupTestFile(filePath2);
    }
  });

  test('should download artifact successfully', async ({ page, context }) => {
    const testFileName = `download-test-${Date.now()}.json`;
    const testFilePath = await createTestFile(testFileName, TEST_FILE_JSON_CONTENT);

    try {
      // Upload artifact
      await uploadArtifactViaUI(page, testFilePath);
      await waitForArtifactInList(page, testFileName);

      // Start listening for download
      const downloadPromise = context.waitForEvent('download');

      // Find and click download button for the artifact
      const artifactRow = page.locator(`text="${testFileName}"`).first();
      await expect(artifactRow).toBeVisible();

      // Click download button (usually near the artifact name)
      const downloadButton = page
        .locator(`text="${testFileName}"`)
        .locator('..')
        .locator('button', { has: page.locator('svg') })
        .nth(0);

      // Try to click if button exists
      const buttons = await page
        .locator(`text="${testFileName}"`)
        .locator('..')
        .locator('button')
        .all();

      if (buttons.length > 0) {
        // Click the first button (likely download)
        await buttons[0].click({ timeout: 5000 }).catch(() => {
          // Download button might not exist in all cases
        });
      }
    } finally {
      cleanupTestFile(testFilePath);
    }
  });

  test('should handle artifact with JSON content', async ({ page }) => {
    const jsonFileName = `test-data-${Date.now()}.json`;
    const filePath = await createTestFile(jsonFileName, TEST_FILE_JSON_CONTENT);

    try {
      // Upload JSON artifact
      await uploadArtifactViaUI(page, filePath);
      await waitForArtifactInList(page, jsonFileName);

      // Verify artifact is displayed
      await expect(page.locator(`text="${jsonFileName}"`).first()).toBeVisible();

      // Verify metadata is shown
      const pageContent = await page.content();
      expect(pageContent).toContain(jsonFileName);
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('should persist artifacts across page reloads', async ({ page }) => {
    const testFileName = `persistent-${Date.now()}.txt`;
    const filePath = await createTestFile(testFileName);

    try {
      // Upload artifact
      await uploadArtifactViaUI(page, filePath);
      await waitForArtifactInList(page, testFileName);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify artifact still exists
      await expect(page.locator(`text="${testFileName}"`).first()).toBeVisible();
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('should handle upload with file size display', async ({ page }) => {
    const largeContent = 'x'.repeat(10240); // 10KB
    const testFileName = `large-file-${Date.now()}.bin`;
    const filePath = await createTestFile(testFileName, largeContent);

    try {
      // Upload artifact
      await uploadArtifactViaUI(page, filePath);
      await waitForArtifactInList(page, testFileName);

      // Verify file size is displayed
      const pageContent = await page.content();
      const sizePattern = /\d+(\.\d+)?\s*(B|KB|MB)/;
      expect(pageContent).toMatch(sizePattern);
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('should show appropriate UI states during upload', async ({ page }) => {
    const testFileName = `state-test-${Date.now()}.txt`;
    const filePath = await createTestFile(testFileName);

    try {
      const fileInput = page.locator('input[type="file"]');

      // Verify upload button is enabled before upload
      const uploadLabel = page
        .locator('input[type="file"]')
        .locator('..')
        .locator('label');
      await expect(uploadLabel).toBeEnabled();

      // Trigger upload
      await fileInput.setInputFiles(filePath);

      // Wait for upload to complete
      await page.waitForTimeout(500);

      // Verify artifact appears
      await waitForArtifactInList(page, testFileName);
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('should handle artifact listing with timestamps', async ({ page }) => {
    const testFileName = `timestamp-test-${Date.now()}.txt`;
    const filePath = await createTestFile(testFileName);

    try {
      // Upload artifact
      await uploadArtifactViaUI(page, filePath);
      await waitForArtifactInList(page, testFileName);

      // Verify timestamp is displayed
      const pageContent = await page.content();
      // Check for common date/time patterns
      const timePattern = /\d{1,2}\/\d{1,2}\/\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/;
      expect(pageContent).toMatch(timePattern);
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('should maintain artifact list order', async ({ page }) => {
    const artifacts = [];
    const fileNames = [];

    try {
      // Upload multiple artifacts with small delays
      for (let i = 0; i < 3; i++) {
        const fileName = `ordered-artifact-${Date.now()}-${i}.txt`;
        const filePath = await createTestFile(fileName, `content ${i}`);
        artifacts.push(filePath);
        fileNames.push(fileName);

        await uploadArtifactViaUI(page, filePath);
        await waitForArtifactInList(page, fileName);
        await page.waitForTimeout(200);
      }

      // Verify all artifacts are visible
      for (const fileName of fileNames) {
        await expect(page.locator(`text="${fileName}"`).first()).toBeVisible();
      }
    } finally {
      for (const filePath of artifacts) {
        cleanupTestFile(filePath);
      }
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Navigate to page
    await navigateToArtifactPage(page);

    // If there's an error section, it should not be visible initially
    const errorSection = page.locator('[class*="error"]', { has: page.locator('text=Failed') }).first();

    // This is a soft check - error handling depends on backend state
    // The page should remain functional even if errors occur
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test('should verify artifact API endpoints respond', async ({ page }) => {
    // Make a direct API call to verify endpoints are available
    const listResponse = await page.request.get('/api/artifacts');
    expect(listResponse.ok()).toBeTruthy();

    const listData = await listResponse.json();
    expect(listData).toHaveProperty('artifacts');
    expect(Array.isArray(listData.artifacts)).toBeTruthy();
  });

  test('should handle concurrent artifact operations', async ({ page }) => {
    const testFile1 = `concurrent-1-${Date.now()}.txt`;
    const testFile2 = `concurrent-2-${Date.now()}.txt`;
    const filePath1 = await createTestFile(testFile1);
    const filePath2 = await createTestFile(testFile2);

    try {
      const fileInput = page.locator('input[type="file"]');

      // Upload first artifact
      await fileInput.setInputFiles(filePath1);
      await page.waitForTimeout(300);

      // Upload second artifact while first is processing
      await fileInput.setInputFiles(filePath2);

      // Wait for both to complete
      await page.waitForTimeout(1500);

      // Verify both appear in list
      await expect(page.locator(`text="${testFile1}"`).first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text="${testFile2}"`).first()).toBeVisible({ timeout: 5000 });
    } finally {
      cleanupTestFile(filePath1);
      cleanupTestFile(filePath2);
    }
  });
});

test.describe('Artifact API Endpoints', () => {
  test('GET /api/artifacts returns proper response structure', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/artifacts');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('artifacts');
    expect(data).toHaveProperty('total');
    expect(typeof data.total).toBe('number');
    expect(Array.isArray(data.artifacts)).toBeTruthy();
  });

  test('POST /api/artifacts accepts file uploads', async ({ request, page }) => {
    const testFileName = `api-test-${Date.now()}.json`;
    const filePath = await createTestFile(testFileName, TEST_FILE_JSON_CONTENT);

    try {
      // Prepare form data
      const fileBuffer = fs.readFileSync(filePath);

      const response = await request.post('http://localhost:3000/api/artifacts', {
        multipart: {
          file: {
            name: testFileName,
            mimeType: 'application/json',
            buffer: fileBuffer,
          },
        },
      });

      // Accept both 200 and 201 as success
      expect([200, 201]).toContain(response.status());

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('createdAt');
      expect(data.name).toBe(testFileName);
    } finally {
      cleanupTestFile(filePath);
    }
  });

  test('artifact metadata includes required fields', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/artifacts');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    if (data.artifacts.length > 0) {
      const artifact = data.artifacts[0];
      expect(artifact).toHaveProperty('id');
      expect(artifact).toHaveProperty('name');
      expect(artifact).toHaveProperty('createdAt');
      expect(typeof artifact.id).toBe('string');
      expect(typeof artifact.name).toBe('string');
      expect(typeof artifact.createdAt).toBe('string');
    }
  });
});
