import { test, expect } from '@playwright/test'

test('counter', async ({ page }) => {
  await page.goto('http://localhost:3000')
  expect(page.locator('text=Count: 0')).toBeVisible()
  await page.click('text=Increment')
  await page.click('text=Increment')
  await page.click('text=Increment')
  expect(await page.locator('text=Count: 3').isVisible()).toBeTruthy()
})

test('first render', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000')
  expect(await page.locator('.spinner').isVisible()).toBeTruthy()
})
