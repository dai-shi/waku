// 01_counter dev mode, make sure development server is running correctly
import { test, expect } from '@playwright/test';

test('counter', async ({ page }) => {
  await page.goto('http://localhost:3002');
  await expect(page.locator('text=Count: 0')).toBeVisible();
  await page.click('text=Increment');
  await page.click('text=Increment');
  await page.click('text=Increment');
  await expect(page.locator('text=Count: 3')).toBeVisible();
});
