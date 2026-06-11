/**
 * @file Sync versions across all workspace packages to match root package.json.
 *
 * Run via: bun run sync-versions
 * Called by semantic-release post-version hook to keep all packages aligned.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = rootPkg.version;

const packages = readdirSync('packages', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const pkg of packages) {
  const path = join('packages', pkg, 'package.json');
  const pkgJson = JSON.parse(readFileSync(path, 'utf-8'));

  if (pkgJson.version === version) {
    console.info(`✓ ${pkg} already at v${version}`);
    continue;
  }

  pkgJson.version = version;
  writeFileSync(path, JSON.stringify(pkgJson, null, 2) + '\n');
  console.info(`↑ ${pkg} updated to v${version}`);
}
