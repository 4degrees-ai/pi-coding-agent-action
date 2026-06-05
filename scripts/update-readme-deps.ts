/**
 * Updates the dependency versions table in README.md between
 * <!-- DEPS_TABLE_START --> and <!-- DEPS_TABLE_END --> markers.
 *
 * Designed for the Bun-workspace monorepo: scans every package under packages/,
 * merges their `dependencies` + `peerDependencies`, skips `workspace:*` links,
 * and reads versions straight from each package.json (assumed to be kept in
 * sync with what's actually installed).
 *
 * Wired into .github/workflows/package.yml so the table is refreshed whenever
 * dist/ is rebuilt on develop.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const scriptDir = __dirname;
const REPO_ROOT = join(scriptDir, '..');
const README_PATH = join(REPO_ROOT, 'README.md');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const MARKER_START = '<!-- DEPS_TABLE_START -->';
const MARKER_END = '<!-- DEPS_TABLE_END -->';

interface DepInfo {
  name: string;
  version: string;
  description: string;
}

/** Friendly descriptions for known dependencies */
const DEP_DESCRIPTIONS: Record<string, string> = {
  '@actions/core': 'GitHub Actions core I/O (inputs, outputs, logging)',
  '@actions/github': 'GitHub API client (Octokit wrapper)',
  '@earendil-works/pi-agent-core': 'Pi Agent Core — agent orchestration primitives',
  '@earendil-works/pi-ai': 'Pi AI — AI model abstractions and providers',
  '@earendil-works/pi-coding-agent': 'Pi SDK — AI coding agent runtime',
  '@js-temporal/polyfill': 'Temporal API polyfill',
  '@octokit/plugin-rest-endpoint-methods': 'Octokit REST API endpoint methods',
  ignore: '`.gitignore`-style pattern matching',
  typebox: 'JSON Schema Type Builder',
};

function isWorkspaceSpec(spec: string): boolean {
  return /^workspace:/.test(spec);
}

/** Strip npm range prefixes (^, ~, =, >=, >, <=, <) and tag suffixes. */
function cleanVersion(spec: string): string {
  return spec
    .replace(/^[=~^<>]?=?\s*/, '')
    .replace(/-.*$/, '')
    .trim();
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function collectWorkspaceDeps(): Map<string, string> {
  if (!existsSync(PACKAGES_DIR)) {
    console.error(`packages directory not found at ${PACKAGES_DIR}`);
    process.exit(1);
  }

  const merged = new Map<string, string>();
  for (const entry of readdirSync(PACKAGES_DIR)) {
    const entryPath = join(PACKAGES_DIR, entry);
    let isDir = false;
    try {
      isDir = statSync(entryPath).isDirectory();
    } catch {
      /* skip */
    }
    if (!isDir) {
      continue;
    }

    const pkgJsonPath = join(entryPath, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      continue;
    }

    const pkg = readJson(pkgJsonPath) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
      merged.set(name, spec);
    }
    // peerDependencies are also "shipped" deps from the consumer's POV
    for (const [name, spec] of Object.entries(pkg.peerDependencies ?? {})) {
      if (!merged.has(name)) {
        merged.set(name, spec);
      }
    }
  }
  return merged;
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

  const allDeps = collectWorkspaceDeps();

  const deps: DepInfo[] = Array.from(allDeps.entries())
    .filter(([, spec]) => !isWorkspaceSpec(spec))
    .map(([name, spec]) => ({
      name,
      version: cleanVersion(spec),
      description: DEP_DESCRIPTIONS[name] ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const table = generateTable(deps);

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
