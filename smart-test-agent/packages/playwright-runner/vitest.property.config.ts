import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.property.test.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 60000, // Property tests may take longer
  },
});
