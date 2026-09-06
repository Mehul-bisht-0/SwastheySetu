/**
 * FILE: apps/mobile/metro.config.js
 * PLAN: IMPLEMENTATION_PLAN.md 12.1
 * STATUS: COMPLETE - do not modify. Revised 2026-09-03: schema.sql is now bundled
 *         as a Metro asset, not parsed as source (see the tail comment). If imports
 *         from @swasthyasetu/core fail, the fix is almost always a stale cache:
 *         `expo start -c`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * apps/mobile lives inside a monorepo but is not an npm workspace member. It
 * reaches packages/core and packages/contracts through `file:` dependencies,
 * which npm installs as symlinks. Metro therefore has to be told two things:
 *
 *   1. watchFolders - watch the repo root, so edits to packages/core/src
 *      trigger a fast refresh in the app instead of being invisible.
 *
 *   2. nodeModulesPaths + disableHierarchicalLookup - resolve every package
 *      from apps/mobile/node_modules first and never walk up past it. Without
 *      this, Metro can find a second copy of react in apps/api/node_modules
 *      and the app dies with "Invalid hook call" or a blank white screen.
 *
 * ---------------------------------------------------------------------------
 * WHY IMPORTING RAW .ts FROM packages/core WORKS
 *
 * packages/core has no build step: its package.json main points at
 * ./src/index.ts, and its internal imports end in .ts (AGENTS.md section 3).
 * Metro resolves an exact path before it tries any sourceExts substitution, so
 * `./redFlags.ts` resolves to the file that is literally there, and Babel
 * strips the types on the way through. The same source runs on the server
 * under Node and on the phone under Hermes.
 *
 * That is the whole reason offline triage is possible: there is exactly one
 * copy of the clinical rules, and neither runtime has a private fork of it.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

// packages/contracts ships zod as a real dependency; make sure the app and the
// shared schemas agree on a single instance, or `instanceof ZodError` breaks.
config.resolver.extraNodeModules = {
  zod: path.resolve(projectRoot, "node_modules/zod"),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

// db/schema.sql is bundled as a Metro asset and read at startup (see
// src/db/client.ts, which resolves it through expo-asset). It must stay out of
// sourceExts: Metro has no transformer for .sql, so it would hand the file to
// Babel and the bundle would die on the first SQL comment. As an asset, Metro
// emits a registerAsset() id that expo-asset turns into a local file.
config.resolver.assetExts = [...config.resolver.assetExts, "sql"];

module.exports = config;
