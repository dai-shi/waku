import { defineConfig } from '@playwright/test';
import { config } from './playwright.config.base.js';

export default defineConfig({
  ...config,
  testDir: './e2e',
});
