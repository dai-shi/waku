import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Don't match "*.spec.ts" (like the vitest default does). They are for playwright.
    include: ['**/*.test.?(c|m)[jt]s?(x)'],
  },
});
