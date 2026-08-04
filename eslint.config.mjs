import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma emits its client here; it is vendored output, not our source.
    "src/generated/**",
    // The design prototypes and their runtime are reference material, not code
    // we ship or maintain.
    "design_handoff_shiv_events/**",
  ]),
]);

export default eslintConfig;
