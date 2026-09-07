import { expect, test } from "@playwright/test";

/**
 * Both doors are reachable on both viewports.
 *
 * Assertions target roles and stable affordances rather than button copy — the previous
 * version pinned the exact string "Join", which broke the moment the call to action was
 * reworded and told us nothing about whether the page actually worked.
 */
test.describe("landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("offers the student a way in", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /how to train/i })).toBeVisible();

    const code = page.getByLabel(/join code/i);
    await expect(code).toBeVisible();
    await code.fill("ABC234");
    await expect(code).toHaveValue("ABC234");

    // The student's submit sits inside the join form, whatever it is called.
    const joinForm = page.locator("form").filter({ has: code });
    await expect(joinForm.getByRole("button")).toBeVisible();
  });

  test("offers the teacher a way in, including practice mode", async ({ page }) => {
    await expect(page.getByPlaceholder(/host pin/i)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /practice game/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
  });

  test("refuses to submit an empty join code", async ({ page }) => {
    // A malformed-but-present code is caught by the input's own pattern attribute, so the
    // only way to reach the JS guard is an empty field: pattern does not apply to "".
    const code = page.getByLabel(/join code/i);
    const joinForm = page.locator("form").filter({ has: code });
    await joinForm.getByRole("button").click();

    // Target the page's own error node: Next renders an empty role="alert" route
    // announcer that would otherwise match first.
    await expect(page.locator("#landing-error")).toContainText(/six-character/i);
    await expect(page).toHaveURL(/\/$/);
  });
});
