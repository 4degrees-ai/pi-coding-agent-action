/**
 * @file Print the structured, provenance-rich commit message for a dist rebuild.
 *
 * Composed from `package.json` + Pi SDK `package.json` + ambient CI env vars.
 * The CI dist-rebuild workflow captures this and passes it to `git commit`, so
 * every `dist/` landing on `develop` self-documents which source SHA and Pi SDK
 * version it was bundled from.
 *
 * In CI, also exports the message as the `message` workflow output (via
 * `$GITHUB_OUTPUT`) so it can be consumed across jobs if needed.
 *
 * Usage: tsx scripts/dist-commit-msg.mts
 */

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeActionVersion,
  composeDistCommitMessage,
  readJsonVersion,
  resolveBranch,
} from '../packages/pi-action/scripts/version';
import { resolvePiSdkPackagePath } from '../packages/pi-action/scripts/pi-sdk';

const baseVersion = readJsonVersion(join(process.cwd(), 'package.json'));
const branch = resolveBranch();
const fullVersion = composeActionVersion(baseVersion, branch);
const sourceSha = process.env.GITHUB_SHA ?? 'unknown';

// Resolve the Pi SDK version the same way the bundler does, so the provenance
// message matches what actually got inlined into dist/index.js. Shared with
// `package.ts` via `resolvePiSdkPackagePath` — the SDK's `exports` map
// doesn't expose `./package.json`, so `require.resolve('…/package.json')`
// throws ERR_PACKAGE_PATH_NOT_EXPORTED under Node/pnpm (Bun was lenient).
const piPkgPath = resolvePiSdkPackagePath();
const piSdkVersion = readJsonVersion(piPkgPath);

const message = composeDistCommitMessage({ fullVersion, branch, sourceSha, piSdkVersion });

// Export as a workflow output when running inside GitHub Actions.
const ghOutput = process.env.GITHUB_OUTPUT;
if (ghOutput) {
  appendFileSync(ghOutput, `message<<EOF\n${message}\nEOF\n`);
}

console.info(message);
