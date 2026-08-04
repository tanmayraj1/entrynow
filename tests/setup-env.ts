/**
 * Load `.env` for DB-backed tests.
 *
 * Hand-rolled rather than pulling in dotenv: this needs to parse a dozen
 * `KEY="value"` lines, and a test harness that fails because a dependency
 * moved is a bad trade for that.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strip one layer of matching quotes; leave everything else alone.
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    // A value already in the environment wins, so CI can override.
    if (!(key in process.env)) process.env[key] = value;
  }
}
