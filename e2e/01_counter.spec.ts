import { test, expect } from '@playwright/test'

test('counter', async ({ page }) => {
  await page.goto('http://localhost:3000')
  expect(page.locator('text=Count: 0')).toBeVisible()
  await page.click('text=Increment')
  await page.click('text=Increment')
  await page.click('text=Increment')
  expect(await page.locator('text=Count: 3').isVisible()).toBeTruthy()
})
