// 02_async
import { test, expect } from '@playwright/test'

test('async', async ({ page }) => {
  await page.goto('http://localhost:3001')
  await expect(page.getByText('Pending...')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByText('Pending...')).toBeVisible()
  await page.waitForTimeout(550)
  // after 1 second, the server should have responded
  await expect(page.getByText('Hello from server!')).toBeVisible()
})
