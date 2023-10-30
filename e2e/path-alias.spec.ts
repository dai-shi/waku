// 11_path-alias
import { expect, test } from "@playwright/test";

test("path alias", async ({ page }) => {
  await page.goto("http://localhost:3011");
  await expect(page.locator("text=This is a server component.")).toBeVisible();
  await expect(page.locator("text=This is a client component.")).toBeVisible();
});
