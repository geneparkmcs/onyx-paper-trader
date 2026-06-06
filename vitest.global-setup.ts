import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// Fresh test DB with the real migrations (incl. CHECK constraints) applied once per run.
export default function setup() {
  const file = path.resolve(process.cwd(), "prisma/test.db");
  for (const f of [file, `${file}-journal`]) {
    try {
      rmSync(f);
    } catch {
      /* not present */
    }
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${file}` },
    stdio: "inherit",
  });
}
