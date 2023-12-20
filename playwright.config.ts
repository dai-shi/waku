import { defineConfig } from '@playwright/test';
import { config } from './playwright.config.base.js';

export default defineConfig({
  ...config,
  workers: 1,
  testDir: './e2e',
});
