/**
 * @file Shared env-var setup for GitHub-Actions-flavoured specs.
 *
 * Sets the four `INPUT_*` / `GITHUB_*` env vars and writes a minimal empty
 * event-path JSON file. Used at the top of specs that import modules doing
 * module-level work against the GitHub Actions environment (e.g.
 * `@alexanderfortin/pi-platform-github`, which calls `getOctokit` at load
 * time, and `tools.spec.ts` which transitively imports it).
 *
 * Lives in `pi-orchestrator` rather than `pi-platform-github` so it can be
 * imported from both packages (the orchestrator package is the lower-level
 * dependency; the platform-github package already imports test helpers
 * from `pi-orchestrator/tests/helpers/` via relative path — see
 * `core-mock.ts` for the precedent).
 *
 * `pi-platform-github/tests/helpers/github-test-env.ts` re-uses this helper
 * from its own `installGitHubEnv` wrapper to keep a single source of truth.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface InstallGithubEnvOptions {
  /**
   * Value for `process.env.INPUT_TRIGGER`. Default `'/pi'`. Set to `false`
   * to skip setting it (matches the legacy behavior of
   * `github-test-env.ts`'s `installGitHubEnv`).
   */
  inputTrigger?: string | false;
  /** Prefix for the temp event-path file (default `'gh-event'`). */
  envPathPrefix?: string;
}

/**
 * Set the GitHub Actions env vars required by module-level code in
 * `@alexanderfortin/pi-platform-github` (and anything that transitively
 * imports it). Returns the resolved event-path.
 *
 * Idempotent in shape — calling it twice overwrites the previous env vars
 * and writes a new event-path file. The previous file is left in place
 * (it's in `os.tmpdir()` and will be cleaned up by the OS).
 */
export function installGithubEnv(options: InstallGithubEnvOptions = {}): string {
  const { inputTrigger = '/pi', envPathPrefix = 'gh-event' } = options;
  if (inputTrigger !== false) {
    process.env.INPUT_TRIGGER = inputTrigger;
  }
  process.env.INPUT_GITHUB_TOKEN = 'fake-token';
  process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
  const eventPath = path.join(os.tmpdir(), `${envPathPrefix}-${Date.now()}.json`);
  fs.writeFileSync(eventPath, '{}');
  process.env.GITHUB_EVENT_PATH = eventPath;
  return eventPath;
}
