/**
 * Updates the dependency versions table in README.md between
 * <!-- DEPS_TABLE_START --> and <!-- DEPS_TABLE_END --> markers.
 *
 * Reads runtime dependencies from package.json and resolves their
 * installed versions from node_modules. Designed to be run by the
 * package.yml workflow after `bun install`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Use process.argv[1] to resolve script location (works in both Bun and Node)
const scriptDir = __dirname;
const README_PATH = join(scriptDir, '..', 'README.md');
const PACKAGE_JSON_PATH = join(scriptDir, '..', 'package.json');
const NODE_MODULES_DIR = join(scriptDir, '..', 'node_modules');

const MARKER_START = '<!-- DEPS_TABLE_START -->';
const MARKER_END = '<!-- DEPS_TABLE_END -->';

interface DepInfo {
  name: string;
  version: string;
  description: string;
}

/** Friendly descriptions for known dependencies */
const DEP_DESCRIPTIONS: Record<string, string> = {
  '@earendil-works/pi-coding-agent': 'Pi SDK — AI coding agent runtime',
  '@actions/core': 'GitHub Actions core I/O (inputs, outputs, logging)',
  '@actions/github': 'GitHub API client (Octokit wrapper)',
  '@js-temporal/polyfill': 'Temporal API polyfill',
  ignore: '`.gitignore`-style pattern matching',
};

function getResolvedVersion(depName: string): string {
  // Handle scoped packages: @scope/name → @scope/name/package.json
  const pkgPath = join(NODE_MODULES_DIR, depName, 'package.json');
  if (!existsSync(pkgPath)) {
    return '—';
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '—';
  } catch {
    return '—';
  }
}

function generateTable(deps: DepInfo[]): string {
  const header = `| Dependency | Version | Description |`;
  const separator = `|---|---|---|`;
  const rows = deps.map(d => `| \`${d.name}\` | \`${d.version}\` | ${d.description} |`);
  return [header, separator, ...rows].join('\n');
}

function main(): void {
  if (!existsSync(README_PATH)) {
    console.error(`README not found at ${README_PATH}`);
    process.exit(1);
  }

  if (!existsSync(PACKAGE_JSON_PATH)) {
    console.error(`package.json not found at ${PACKAGE_JSON_PATH}`);
    process.exit(1);
  }

  // Read runtime dependencies
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  const dependencies: Record<string, string> = pkg.dependencies ?? {};

  const deps: DepInfo[] = Object.keys(dependencies)
    .sort()
    .map(name => ({
      name,
      version: getResolvedVersion(name),
      description: DEP_DESCRIPTIONS[name] ?? '',
    }));

  const table = generateTable(deps);

  // Read README and replace between markers
  const readme = readFileSync(README_PATH, 'utf-8');
  const startIdx = readme.indexOf(MARKER_START);
  const endIdx = readme.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    console.error(`README.md is missing ${MARKER_START} and/or ${MARKER_END} markers`);
    process.exit(1);
  }

  const updated =
    readme.slice(0, startIdx + MARKER_START.length) +
    '\n\n' +
    table +
    '\n\n' +
    readme.slice(endIdx);

  writeFileSync(README_PATH, updated);
  console.info('README dependency table updated successfully.');
  console.info(table);
}

main();
