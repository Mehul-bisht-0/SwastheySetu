/**
 * FILE: scripts/check-no-secrets.mjs
 * PLAN: IMPLEMENTATION_PLAN.md 14, GUARDRAIL 7
 * STATUS: COMPLETE - do not modify
 *
 * Fails the build if anything resembling a credential appears in apps/mobile.
 * GUARDRAIL 7 ("no LLM or third-party key reaches the client") made mechanical.
 * Run by `npm run verify`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "apps/mobile";
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "android", "ios", ".git"]);
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".mjs", ".cjs"]);

/** Each pattern is [regex, human explanation]. */
const PATTERNS = [
  [/\bsk-[A-Za-z0-9]{16,}/, "OpenAI-style secret key"],
  [/\bsk-ant-[A-Za-z0-9-]{16,}/, "Anthropic secret key"],
  [/LLM_API_KEY\s*[:=]\s*["'][^"']+["']/, "hardcoded LLM_API_KEY value"],
  [/JWT_SECRET\s*[:=]\s*["'][^"']+["']/, "hardcoded JWT_SECRET value"],
  [/Authorization\s*:\s*["']Bearer\s+[A-Za-z0-9._-]{20,}["']/, "hardcoded bearer token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
];

const findings = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!SCAN_EXT.has(extname(entry))) continue;
    const text = readFileSync(full, "utf8");
    text.split("\n").forEach((line, i) => {
      for (const [re, why] of PATTERNS) {
        if (re.test(line)) findings.push(`${full}:${i + 1}  ${why}`);
      }
    });
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error("\nGUARDRAIL VIOLATION - possible secret in the mobile client:\n");
  for (const f of findings) console.error("  " + f);
  console.error("\nAll model and third-party calls must originate on the backend.\n");
  process.exit(1);
}
console.log("check-no-secrets: clean (%s scanned)", ROOT);
