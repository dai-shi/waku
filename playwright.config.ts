import {
  defineConfig
} from '@playwright/test'
import { resolve } from 'node:path'
import { config } from './playwright.config.base.js'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  ...config,
  testDir: './e2e',
  webServer: [
    {
      command: 'pnpm run build && pnpm run start',
      cwd: resolve(rootDir, 'examples', '01_counter'),
      port: 3000,
      timeout: 10 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '3000'
      }
    },
    {
      command: 'pnpm run build && pnpm run start',
      cwd: resolve(rootDir, 'examples', '02_async'),
      port: 3001,
      timeout: 10 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '3001'
      }
    }
  ]
})
