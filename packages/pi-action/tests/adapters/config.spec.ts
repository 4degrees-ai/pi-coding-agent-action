/**
 * Tests for gatherActionsConfig() — the GitHub Actions config adapter.
 *
 * Tests that the config gathering logic correctly parses @actions/core
 * inputs into a PiConfig object with proper defaults and validation.
 *
 * Mock strategy: we register the shared `coreMock` object via a DIRECT
 * `vi.mock()` call (Vitest hoists vi.mock calls before import resolution).
 * Both this direct call and `registerCoreMock()` (used by other test files)
 * point to the **same** `coreMock` object, so regardless of which
 * registration Vitest processes first, `@actions/core` always resolves to
 * `coreMock`. Per-test overrides are then applied via
 * `coreMock.getInput.mockImplementation(...)`.
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { coreMock } from '../../../pi-orchestrator/tests/helpers/core-mock';

// Register the mock DIRECTLY (hoisted by Vitest) pointing to the shared coreMock
// object — same object registerCoreMock() uses, so order doesn't matter.
vi.mock('@actions/core', () => coreMock);

import { gatherActionsConfig } from '../../src/adapters/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set per-test input overrides on top of required defaults.
 */
function mockCore(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    token: 'test-token',
    thinking_level: '',
    prompt: '',
    ...overrides,
  };
  coreMock.getInput.mockImplementation((name: string) => defaults[name] ?? '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gatherActionsConfig', () => {
  beforeEach(() => {
    coreMock.getInput.mockClear();
    coreMock.debug.mockClear();
    coreMock.setSecret.mockClear();
    coreMock.warning.mockClear();
    mockCore();
  });

  describe('required fields validation', () => {
    test('throws descriptive error when provider is missing', () => {
      mockCore({ provider: '' });
      expect(() => gatherActionsConfig()).toThrow('Missing required input: `provider`');
    });

    test('provider error mentions possible values', () => {
      mockCore({ provider: '' });
      expect(() => gatherActionsConfig()).toThrow(/anthropic/);
    });

    test('throws descriptive error when model is missing', () => {
      mockCore({ model: '' });
      expect(() => gatherActionsConfig()).toThrow('Missing required input: `model`');
    });

    test('allows empty token for provider-side auth', () => {
      mockCore({ provider: 'google-vertex', model: 'gemini-2.5-pro', token: '' });
      const config = gatherActionsConfig();
      expect(config.token).toBe('');
      expect(coreMock.setSecret).not.toHaveBeenCalled();
    });

    test('registers a non-empty provider token as a secret without a custom header', () => {
      gatherActionsConfig();
      expect(coreMock.setSecret).toHaveBeenCalledWith('test-token');
    });
  });

  describe('default values', () => {
    test('loadBuiltinExtensions defaults to true', () => {
      const config = gatherActionsConfig();
      expect(config.loadBuiltinExtensions).toBe(true);
    });

    test('exportSessionHtml defaults to true', () => {
      const config = gatherActionsConfig();
      expect(config.exportSessionHtml).toBe(true);
    });

    test('exportSessionJsonl defaults to false', () => {
      const config = gatherActionsConfig();
      expect(config.exportSessionJsonl).toBe(false);
    });

    test('autoCompaction defaults to false', () => {
      const config = gatherActionsConfig();
      expect(config.autoCompaction).toBe(false);
    });
  });

  describe('boolean input parsing', () => {
    test('parses load_builtin_extensions false', () => {
      mockCore({ load_builtin_extensions: 'false' });
      expect(gatherActionsConfig().loadBuiltinExtensions).toBe(false);
    });

    test('parses export_session_html false', () => {
      mockCore({ export_session_html: 'false' });
      expect(gatherActionsConfig().exportSessionHtml).toBe(false);
    });

    test('parses export_session_jsonl true', () => {
      mockCore({ export_session_jsonl: 'true' });
      expect(gatherActionsConfig().exportSessionJsonl).toBe(true);
    });

    test('parses auto_compaction true', () => {
      mockCore({ auto_compaction: 'true' });
      expect(gatherActionsConfig().autoCompaction).toBe(true);
    });
  });

  describe('extensions parsing', () => {
    test('parses newline-separated extensions', () => {
      mockCore({ extensions: 'npm:package-one\ngit:github.com/user/repo\n./local-path.ts' });
      const config = gatherActionsConfig();
      expect(config.extensions).toEqual([
        'npm:package-one',
        'git:github.com/user/repo',
        './local-path.ts',
      ]);
    });

    test('omits extensions when input is empty', () => {
      mockCore({ extensions: '' });
      const config = gatherActionsConfig();
      expect(config.extensions).toBeUndefined();
    });
  });

  describe('loaded_tools parsing', () => {
    test('parses newline-separated tool names (YAML list style)', () => {
      mockCore({
        loaded_tools: 'get_pr_diff\ncreate_pull_request\nget_issue_or_pr_thread',
      });
      const config = gatherActionsConfig();
      expect(config.loadedTools).toEqual([
        'get_pr_diff',
        'create_pull_request',
        'get_issue_or_pr_thread',
      ]);
    });

    test('returns undefined for "all"', () => {
      mockCore({ loaded_tools: 'all' });
      const config = gatherActionsConfig();
      expect(config.loadedTools).toBeUndefined();
    });

    test('returns undefined for empty input', () => {
      mockCore({ loaded_tools: '' });
      const config = gatherActionsConfig();
      expect(config.loadedTools).toBeUndefined();
    });

    test('deduplicates tool names', () => {
      mockCore({ loaded_tools: 'read\nread\nwrite' });
      const config = gatherActionsConfig();
      expect(config.loadedTools).toEqual(['read', 'write']);
    });
  });

  describe('diff configuration', () => {
    test('parses diff_max_lines', () => {
      mockCore({ diff_max_lines: '500' });
      expect(gatherActionsConfig().diffMaxLines).toBe(500);
    });

    test('parses diff_max_bytes', () => {
      mockCore({ diff_max_bytes: '204800' });
      expect(gatherActionsConfig().diffMaxBytes).toBe(204800);
    });

    test('parses diff_ignore_patterns', () => {
      mockCore({ diff_ignore_patterns: 'dist/ package-lock.json' });
      expect(gatherActionsConfig().diffIgnorePatterns).toEqual(['dist/', 'package-lock.json']);
    });

    test('ignores non-numeric diff_max_lines', () => {
      mockCore({ diff_max_lines: 'not-a-number' });
      expect(gatherActionsConfig().diffMaxLines).toBeUndefined();
    });

    test('ignores negative diff_max_lines', () => {
      mockCore({ diff_max_lines: '-1' });
      expect(gatherActionsConfig().diffMaxLines).toBeUndefined();
    });

    test('ignores zero diff_max_lines', () => {
      mockCore({ diff_max_lines: '0' });
      expect(gatherActionsConfig().diffMaxLines).toBeUndefined();
    });
  });

  describe('review time budgets', () => {
    test('omits review time budgets by default', () => {
      const config = gatherActionsConfig();
      expect(config.convergeAfterSeconds).toBeUndefined();
      expect(config.finalizeAfterSeconds).toBeUndefined();
    });

    test('parses positive review time budgets', () => {
      mockCore({ converge_after_seconds: '600', finalize_after_seconds: '900' });
      const config = gatherActionsConfig();
      expect(config.convergeAfterSeconds).toBe(600);
      expect(config.finalizeAfterSeconds).toBe(900);
    });

    test.each(['nope', '0', '-1', '1e3', '2147484'])(
      'rejects invalid review time budget %s',
      value => {
        mockCore({ converge_after_seconds: value });
        expect(() => gatherActionsConfig()).toThrow('`converge_after_seconds` must be');
      }
    );

    test('accepts the largest timer-safe review time budget', () => {
      mockCore({ finalize_after_seconds: '2147483' });
      expect(gatherActionsConfig().finalizeAfterSeconds).toBe(2_147_483);
    });

    test('rejects a convergence threshold that does not precede finalization', () => {
      mockCore({ converge_after_seconds: '900', finalize_after_seconds: '900' });
      expect(() => gatherActionsConfig()).toThrow(
        '`converge_after_seconds` must be less than `finalize_after_seconds`'
      );
    });
  });

  describe('base_url', () => {
    test('parses base_url when provided', () => {
      mockCore({ base_url: 'https://my-proxy.example.com/v1' });
      expect(gatherActionsConfig().baseUrl).toBe('https://my-proxy.example.com/v1');
    });

    test('omits base_url when empty', () => {
      mockCore({ base_url: '' });
      expect(gatherActionsConfig().baseUrl).toBeUndefined();
    });
  });

  describe('custom API key header', () => {
    test('omits apiKeyHeader when the input is empty', () => {
      mockCore({ api_key_header: '' });
      expect(gatherActionsConfig().apiKeyHeader).toBeUndefined();
    });

    test('preserves the configured header name and masks its token', () => {
      mockCore({ api_key_header: 'LUNAROUTE-API-KEY', token: 'token-without-bearer' });
      const config = gatherActionsConfig();

      expect(config.apiKeyHeader).toBe('LUNAROUTE-API-KEY');
      expect(config.token).toBe('token-without-bearer');
      expect(coreMock.setSecret).toHaveBeenCalledWith('token-without-bearer');
    });

    test('rejects a custom header without a token', () => {
      mockCore({ api_key_header: 'LUNAROUTE-API-KEY', token: '' });
      expect(() => gatherActionsConfig()).toThrow(
        '`api_key_header` requires a non-empty `token` input'
      );
    });

    test('rejects an invalid HTTP token header name', () => {
      mockCore({ api_key_header: 'X API Key' });
      expect(() => gatherActionsConfig()).toThrow(
        '`api_key_header` must be a valid HTTP token header name'
      );
    });

    test('rejects the provider-owned Authorization header name case-insensitively', () => {
      mockCore({ api_key_header: 'aUtHoRiZaTiOn' });
      expect(() => gatherActionsConfig()).toThrow(
        '`api_key_header` cannot be `Authorization` because it collides with provider authentication'
      );
    });
  });

  describe('session sharing inputs', () => {
    test('share_session defaults to false', () => {
      expect(gatherActionsConfig().shareSession).toBe(false);
    });

    test('parses share_session true', () => {
      mockCore({ share_session: 'true' });
      expect(gatherActionsConfig().shareSession).toBe(true);
    });

    test('omits githubToken when empty', () => {
      expect(gatherActionsConfig().githubToken).toBeUndefined();
    });

    test('parses github_token when provided', () => {
      mockCore({ github_token: 'ghp_secret' });
      expect(gatherActionsConfig().githubToken).toBe('ghp_secret');
    });

    test('does not auto-enable exportSessionHtml at config time (orchestrator responsibility)', () => {
      mockCore({ share_session: 'true', export_session_html: 'false' });
      const config = gatherActionsConfig();
      // Config adapter parses inputs verbatim; the orchestrator derives the
      // effective HTML-export flag (exportSessionHtml || shareSession).
      expect(config.shareSession).toBe(true);
      expect(config.exportSessionHtml).toBe(false);
    });

    test('registers github_token as a secret for log masking', () => {
      mockCore({ github_token: 'ghp_secret' });
      gatherActionsConfig();
      expect(coreMock.setSecret).toHaveBeenCalledWith('ghp_secret');
    });

    test('does not call setSecret when github_token is empty', () => {
      mockCore({ github_token: '' });
      gatherActionsConfig();
      expect(coreMock.setSecret).not.toHaveBeenCalledWith('');
    });

    test('share_gist_provider defaults to undefined (github)', () => {
      expect(gatherActionsConfig().shareGistProvider).toBeUndefined();
    });

    test('parses share_gist_provider opengist (case-insensitive)', () => {
      mockCore({ share_gist_provider: 'Opengist' });
      expect(gatherActionsConfig().shareGistProvider).toBe('opengist');
    });

    test('normalizes an unknown share_gist_provider to undefined and warns', () => {
      mockCore({ share_gist_provider: 'dropbox' });
      expect(gatherActionsConfig().shareGistProvider).toBeUndefined();
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringMatching(/Unknown share_gist_provider "dropbox".*falling back to github/)
      );
    });

    test('does not warn for a recognised share_gist_provider', () => {
      mockCore({ share_gist_provider: 'opengist' });
      gatherActionsConfig();
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('parses share_gist_api_url', () => {
      mockCore({ share_gist_api_url: 'https://gist.l3x.in/api/gists' });
      expect(gatherActionsConfig().shareGistApiUrl).toBe('https://gist.l3x.in/api/gists');
    });

    test('omits share_gist_api_url when empty', () => {
      mockCore({ share_gist_api_url: '   ' });
      expect(gatherActionsConfig().shareGistApiUrl).toBeUndefined();
    });

    test('parses share_gist_token and registers it as a secret', () => {
      mockCore({ share_gist_token: 'og_secret' });
      const config = gatherActionsConfig();
      expect(config.shareGistToken).toBe('og_secret');
      expect(coreMock.setSecret).toHaveBeenCalledWith('og_secret');
    });
  });
});
