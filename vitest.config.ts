import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on import unless a React Server Component build
      // is active. Point it at the package's OWN server build (`empty.js`,
      // what the "react-server" condition resolves to) rather than a stub of
      // ours — these tests run server modules in a server context, which is
      // precisely what the marker permits.
      "server-only": resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    // DB-backed invariant tests need DATABASE_URL from .env.
    setupFiles: ["tests/setup-env.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Concurrency tests in later phases race real rows in a real Postgres and
    // must not run against each other.
    fileParallelism: false,
  },
});
