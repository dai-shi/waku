import { test, expect } from '@playwright/test'

test('async', async ({ page }) => {
  await page.goto('http://localhost:3000')
  expect(page.getByText('Pending...').isVisible()).toBeTruthy()
  await page.waitForTimeout(200)
  expect(page.getByText('Pending...').isVisible()).toBeTruthy()
  await page.waitForTimeout(1000)
  // after 1 second, the server should have responded
  expect(await page.getByText('Hello from server!').isVisible()).toBeTruthy()
})
