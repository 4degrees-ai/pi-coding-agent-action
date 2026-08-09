/**
 * Contract tests for the workspace-read-only action input.
 *
 * Hardened mode is deliberately strict: the action must not silently accept
 * an extension or a tool list that would widen the reviewer's capabilities.
 * These tests use the same @actions/core mock as config.spec.ts and exercise
 * the public config-gathering boundary rather than implementation details.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { coreMock } from '../../../pi-orchestrator/tests/helpers/core-mock';

vi.mock('@actions/core', () => coreMock);

import { gatherActionsConfig } from '../../src/adapters/config';

const DEFAULT_INPUTS: Record<string, string> = {
  provider: 'openai',
  model: 'gpt-5.6-luna',
  token: 'test-token',
  thinking_level: 'max',
  prompt: 'Review this change',
};

const HARDENED_INPUTS: Record<string, string> = {
  isolation_mode: 'workspace-read-only',
  load_builtin_extensions: 'false',
  loaded_tools: 'read\ngrep\nfind\nls',
  export_session_html: 'false',
  export_session_jsonl: 'false',
  share_session: 'false',
};

function mockCore(overrides: Record<string, string> = {}): void {
  const inputs = { ...DEFAULT_INPUTS, ...overrides };
  coreMock.getInput.mockImplementation((name: string) => inputs[name] ?? '');
}

describe('gatherActionsConfig workspace-read-only contract', () => {
  beforeEach(() => {
    coreMock.getInput.mockClear();
    coreMock.setSecret.mockClear();
    coreMock.warning.mockClear();
    mockCore();
  });

  test('parses the exact workspace-read-only isolation mode', () => {
    mockCore(HARDENED_INPUTS);

    expect(gatherActionsConfig()).toMatchObject({ isolationMode: 'workspace-read-only' });
  });

  test('rejects unknown isolation modes instead of falling back to normal mode', () => {
    mockCore({ ...HARDENED_INPUTS, isolation_mode: 'workspace-read-write' });

    expect(() => gatherActionsConfig()).toThrow(/isolation_mode/i);
    expect(() => gatherActionsConfig()).toThrow(/workspace-read-only/i);
  });

  test('rejects custom extensions in workspace-read-only mode', () => {
    mockCore({
      ...HARDENED_INPUTS,
      extensions: 'npm:untrusted-review-extension',
    });

    expect(() => gatherActionsConfig()).toThrow(/extensions.*workspace-read-only/i);
  });

  test('rejects a tool list that is wider than the four hardened tools', () => {
    mockCore({
      ...HARDENED_INPUTS,
      loaded_tools: 'read\ngrep\nfind\nls\nwrite',
    });

    expect(() => gatherActionsConfig()).toThrow(/loaded_tools.*workspace-read-only/i);
  });

  test('rejects the normal-mode all-tools default when explicitly requested', () => {
    mockCore({ ...HARDENED_INPUTS, loaded_tools: 'all' });

    expect(() => gatherActionsConfig()).toThrow(/loaded_tools.*read.*grep.*find.*ls/i);
  });

  test('accepts exactly read, grep, find, and ls in hardened mode', () => {
    mockCore(HARDENED_INPUTS);

    expect(gatherActionsConfig()).toMatchObject({
      isolationMode: 'workspace-read-only',
      loadedTools: ['read', 'grep', 'find', 'ls'],
    });
  });

  test('rejects built-in extensions when explicitly enabled', () => {
    mockCore({ ...HARDENED_INPUTS, load_builtin_extensions: 'true' });

    expect(() => gatherActionsConfig()).toThrow(/load_builtin_extensions.*workspace-read-only/i);
  });

  test('rejects HTML session export in hardened mode', () => {
    mockCore({ ...HARDENED_INPUTS, export_session_html: 'true' });

    expect(() => gatherActionsConfig()).toThrow(/session exports.*workspace-read-only/i);
  });

  test('rejects JSONL session export in hardened mode', () => {
    mockCore({ ...HARDENED_INPUTS, export_session_jsonl: 'true' });

    expect(() => gatherActionsConfig()).toThrow(/session exports.*workspace-read-only/i);
  });

  test('rejects session sharing in hardened mode', () => {
    mockCore({ ...HARDENED_INPUTS, share_session: 'true' });

    expect(() => gatherActionsConfig()).toThrow(/sharing.*workspace-read-only/i);
  });
});
