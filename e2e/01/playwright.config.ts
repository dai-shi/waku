import {
  defineConfig
} from '@playwright/test'
import { config } from '../../playwright.config.base.js'

export default defineConfig({
  ...config,
  testDir: '.',
  webServer: {
    command: 'pnpm run examples:dev:01_counter',
    port: 3000,
    timeout: 10 * 1000,
    reuseExistingServer: !process.env.CI
  }
})
