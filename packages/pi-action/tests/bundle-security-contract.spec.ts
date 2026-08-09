import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const bundlePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../dist/index.js');

describe('shipped bundle security contract', () => {
  test('contains the workspace-read-only enforcement markers', () => {
    const bundle = readFileSync(bundlePath, 'utf8');

    for (const marker of [
      'isolation_mode',
      'workspace-read-only',
      'GITHUB_WORKSPACE',
      'WORKSPACE_BOUNDARY_VIOLATION',
      'WORKSPACE_PATH_UNAVAILABLE',
      'raw_response',
      'read',
      'grep',
      'find',
      'ls',
    ]) {
      expect(bundle.includes(marker), `dist/index.js is missing security marker ${marker}`).toBe(
        true
      );
    }
  });
});
