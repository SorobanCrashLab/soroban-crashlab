import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      // Ban explicit `any` in lib and utility layers.
      // Component JSX excluded initially to keep scope shippable.
      "@typescript-eslint/no-explicit-any": "off",
      // Architecture guard: artifact-fs behavior lives only under src/lib,
      // so a divergent same-named utility module cannot reappear (issue
      // #1606) and be imported by accident. Filesystem uniqueness is
      // additionally enforced by src/lib/artifact-fs-adapter.audit.test.ts.
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["*/app/utils/artifact-fs-adapter*", "@/app/utils/artifact-fs-adapter*"],
            message: "Artifact fs helpers live only in src/lib/artifact-fs-adapter.ts. Import from '@/lib/artifact-fs-adapter'.",
          },
        ],
      }],
    },
  },
  {
    files: ["src/lib/**/*.ts", "src/app/utils/**/*.ts", "src/app/*-utils.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Allow `any` in test files within the scoped directories
  {
    files: ["src/lib/**/*.test.ts", "src/lib/**/*.test.tsx", "src/app/utils/**/*.test.ts", "src/app/utils/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".tmp-test/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
