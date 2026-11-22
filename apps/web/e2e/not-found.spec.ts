import { expect, test } from "./fixtures";

test.describe("Branded not-found page", () => {
  test.setTimeout(90_000);

  test("identifies the missing route and links back into the app", async ({ page }) => {
    const missingPath = "/this-route-does-not-exist";

    const response = await page.goto(missingPath);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "This route slipped past the fuzzer" }),
    ).toBeVisible();
    await expect(page.getByText(missingPath, { exact: true })).toBeVisible();

    const recoveryLinks = page.getByRole("navigation", { name: "Page recovery options" }).getByRole("link");
    await expect(recoveryLinks).toHaveCount(4);
    await expect(recoveryLinks.nth(0)).toHaveAttribute("href", "/dashboard");
    await expect(recoveryLinks.nth(1)).toHaveAttribute("href", "/runs");
    await expect(recoveryLinks.nth(2)).toHaveAttribute("href", "/search");
    await expect(recoveryLinks.nth(3)).toHaveAttribute("href", "/start");

    await Promise.all([
      page.waitForURL("**/dashboard", { waitUntil: "commit", timeout: 60_000 }),
      recoveryLinks.nth(0).click(),
    ]);
    await expect(page.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();
  });
});
