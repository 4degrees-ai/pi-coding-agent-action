/**
 * @file Resolve the on-disk `package.json` of the bundled Pi SDK.
 *
 * Shared by the esbuild bundler (`package.ts`) and the CI dist-rebuild
 * provenance script (`scripts/dist-commit-msg.mts`). Extracted so the
 * resolution logic lives in exactly one place — a prior duplication caused
 * the `rebuild` job to break when only `package.ts` was migrated off Bun and
 * `dist-commit-msg.mts` was left using the old `require.resolve` call.
 *
 * ## Why not `require.resolve('@earendil-works/pi-coding-agent/package.json')`?
 *
 * The Pi SDK's `exports` map doesn't expose `./package.json`, and Node/pnpm
 * enforce `exports` strictly — so resolving the `./package.json` subpath
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. (Bun was lenient about this, which
 * is why it only surfaced after the Bun → Node migration.) The package also
 * ships only an `import` export condition (no `require`), so CJS
 * `require.resolve` fails entirely. Instead we resolve the package's main
 * entry via `import.meta.resolve` (ESM, honours the `import` condition) and
 * walk up to the nearest `package.json`.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default Pi SDK package the action bundles. */
export const PI_SDK_PACKAGE = '@earendil-works/pi-coding-agent';

/**
 * Resolve the absolute path to the Pi SDK's `package.json`.
 *
 * @param pkgName - Package name to resolve (defaults to {@link PI_SDK_PACKAGE}).
 * @returns Absolute path to the package's `package.json`.
 * @throws if the package can't be resolved, or no `package.json` is found
 *   walking up from its resolved main entry.
 */
export function resolvePiSdkPackagePath(pkgName: string = PI_SDK_PACKAGE): string {
  const mainUrl = import.meta.resolve(pkgName);
  let dir = dirname(fileURLToPath(mainUrl));
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate ${pkgName}/package.json`);
    }
    dir = parent;
  }
  return join(dir, 'package.json');
}
