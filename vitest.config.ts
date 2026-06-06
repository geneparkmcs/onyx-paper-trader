import { defineConfig } from "vitest/config";
import path from "node:path";

// Order-engine tests run against an isolated SQLite file (absolute path so the CLI and the
// runtime client resolve to the exact same DB). Pure-logic tests ignore it.
const TEST_DB = `file:${path.resolve(__dirname, "prisma/test.db")}`;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { DATABASE_URL: TEST_DB, JWT_SECRET: "test-secret" },
    globalSetup: ["./vitest.global-setup.ts"],
    fileParallelism: false, // share one SQLite test DB across files
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
