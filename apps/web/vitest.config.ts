import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
import {
  findScriptStyleTests,
  QUARANTINED_TESTS,
  toGlobPattern,
} from './src/test/script-style-tests';

/**
 * Script-style tests are executed by `src/test/script-style-tests.test.ts`
 * rather than directly: they contain no `describe`/`it`, so Vitest would
 * otherwise fail them with "No test suite found in file".
 */
const scriptStyleTests = findScriptStyleTests(__dirname);

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      ...QUARANTINED_TESTS.map(toGlobPattern),
      ...scriptStyleTests.map(toGlobPattern),
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        // Next.js entry points and generated instrumentation carry no logic
        // worth measuring and would otherwise dilute the reported numbers.
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/not-found.tsx',
        'src/instrumentation*.ts',
        'src/proxy.ts',
      ],
    },
  },
});
