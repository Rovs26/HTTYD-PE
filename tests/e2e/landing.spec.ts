import { expect, test } from "@playwright/test";

test("landing page exposes host and student entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /How to Train Your Dragon/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create Game/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Join$/i })).toBeVisible();
});
