// 01_counter
import { test, expect } from "@playwright/test";

test("counter", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.locator("text=Count: 0")).toBeVisible();
  await page.click("text=Increment");
  await page.click("text=Increment");
  await page.click("text=Increment");
  await expect(page.locator("text=Count: 3")).toBeVisible();
});

test("first render", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000");
  await expect(page.locator(".spinner")).toBeVisible();
});
