// 02_async
import { test, expect } from "@playwright/test";

test("async", async ({ page }) => {
  await page.goto("http://localhost:3001");
  await page.route("**/RSC/App/props=**", async (route) => {
    // before html streaming
    await expect(page.getByText("Pending...")).toBeVisible();
    return route.continue();
  });
  await expect(page.getByText("Hello from server!")).toBeVisible();
});
