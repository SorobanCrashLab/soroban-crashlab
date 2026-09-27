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
      // Enforce `any` ban globally across all scopes, including component JSX
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["*/app/utils/artifact-fs-adapter*", "@/app/utils/artifact-fs-adapter*"],
            message: "Artifact fs helpers live only in src/lib/artifact-fs-adapter.ts. Import from '@/lib/artifact-fs-adapter'.",
          },
        ],
      }],
      "no-restricted-properties": ["error",
        { object: "window", property: "localStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
        { object: "window", property: "sessionStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
        { object: "globalThis", property: "localStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
        { object: "globalThis", property: "sessionStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
      ],
      "no-restricted-globals": ["error",
        { name: "localStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
        { name: "sessionStorage", message: "Use safeStorage helpers from '@/lib/local-storage'." },
      ],
      "no-restricted-syntax": ["error",
        {
          selector: "MemberExpression[object.name='localStorage']",
          message: "Raw localStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
        {
          selector: "MemberExpression[object.object.name='window'][property.name='localStorage']",
          message: "Raw localStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
        {
          selector: "MemberExpression[object.object.name='globalThis'][property.name='localStorage']",
          message: "Raw localStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
        {
          selector: "MemberExpression[object.name='sessionStorage']",
          message: "Raw sessionStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
        {
          selector: "MemberExpression[object.object.name='window'][property.name='sessionStorage']",
          message: "Raw sessionStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
        {
          selector: "MemberExpression[object.object.name='globalThis'][property.name='sessionStorage']",
          message: "Raw sessionStorage access is banned; use safeStorage helpers from '@/lib/local-storage'.",
        },
      ],
    },
  },
  // Allow `any` in test files within the scoped directories
  {
    files: ["src/lib/**/*.test.ts", "src/lib/**/*.test.tsx", "src/app/utils/**/*.test.ts", "src/app/utils/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "src/lib/local-storage.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "e2e/**",
      "public/theme-script.js",
    ],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-syntax": "off",
      "no-restricted-properties": "off",
    },
  },
  globalIgnores([
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