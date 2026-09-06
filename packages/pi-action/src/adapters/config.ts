/**
 * @file GitHub Actions configuration adapter.
 *
 * Extracts configuration from `@actions/core` inputs into a plain
 * `PiConfig` object. This is the GitHub Action frontend's implementation
 * of config gathering; other frontends (CLI, GitHub App) would provide
 * their own implementation.
 *
 * Structure:
 *   - Parsing helpers (`parseBooleanInput`, `parsePositiveIntInput`,
 *     `parseStringListInput`, `parseLoadedTools`) — pure functions over
 *     raw string inputs. Exported so they can be unit-tested directly.
 *   - `validateRequiredInputs` — throws descriptive errors when a
 *     required input is missing. Error messages are exported as
 *     constants so the contract is stable for callers (and snapshot tests).
 *   - `gatherActionsConfig` — the entry point. Reads inputs, parses them,
 *     assembles the final `PiConfig`.
 */

import * as core from '@actions/core';
import { validateWorkspaceReadOnlyPolicy } from '@alexanderfortin/pi-orchestrator';
import type { PiConfig } from '@alexanderfortin/pi-orchestrator';

// ---------------------------------------------------------------------------
// Error message constants — keep stable; they are part of the public
// contract documented in `action.yml` and surfaced to users in the
// Actions log.
// ---------------------------------------------------------------------------

export const MISSING_PROVIDER_MESSAGE =
  'Missing required input: `provider`. ' +
  'Set it to your LLM provider (e.g. "anthropic", "openai", "google"). ' +
  'See https://github.com/shaftoe/pi-coding-agent-action#usage for details.';

export const MISSING_MODEL_MESSAGE =
  'Missing required input: `model`. ' +
  'Set it to the desired model (e.g. "claude-sonnet-4-5", "gpt-4o"). ' +
  'See https://github.com/shaftoe/pi-coding-agent-action#usage for details.';

const WORKSPACE_READ_ONLY_MODE = 'workspace-read-only';
const MAX_REVIEW_BUDGET_SECONDS = 2_147_483;
const HTTP_TOKEN_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

// ---------------------------------------------------------------------------
// Parsing helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Parse a yes/no string into a boolean. Returns `defaultValue` when the
 * input is empty. Only the literal string `'true'` (case-insensitive)
 * maps to `true`; any other non-empty value maps to `false`.
 */
export function parseBooleanInput(raw: string, defaultValue: boolean): boolean {
  return raw ? raw.toLowerCase() === 'true' : defaultValue;
}

/**
 * Parse a string into a positive integer. Returns `undefined` when the
 * input is empty, non-numeric, or ≤ 0.
 */
export function parsePositiveIntInput(raw: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = parseInt(raw, 10);
  return parsed > 0 ? parsed : undefined;
}

function parseReviewBudgetInput(inputName: string, raw: string): number | undefined {
  const normalized = raw.trim();
  if (!normalized) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(
      `\`${inputName}\` must be a positive whole number no greater than ${MAX_REVIEW_BUDGET_SECONDS} seconds.`
    );
  }
  const seconds = Number(normalized);
  if (!Number.isSafeInteger(seconds) || seconds > MAX_REVIEW_BUDGET_SECONDS) {
    throw new Error(
      `\`${inputName}\` must be a positive whole number no greater than ${MAX_REVIEW_BUDGET_SECONDS} seconds.`
    );
  }
  return seconds;
}

/**
 * Split a string into a trimmed, deduped list of non-empty items using
 * `separator`. Returns `undefined` when the input is empty or contains
 * only whitespace.
 *
 * @example
 *   parseStringListInput('a\nb\nc', '\n')           // ['a', 'b', 'c']
 *   parseStringListInput('a b  c', /\s+/)           // ['a', 'b', 'c']
 *   parseStringListInput('', '\n')                  // undefined
 */
export function parseStringListInput(
  raw: string,
  separator: string | RegExp
): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  const items = raw
    .split(separator)
    .map(s => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Parse the `loaded_tools` input.
 *
 * - `'all'`, empty, or whitespace-only → `undefined` (use all tools)
 * - List of tool names (one per line) → `string[]`
 *
 * Whitespace around tool names is trimmed. Empty items after splitting are
 * discarded. Duplicate names are deduplicated.
 */
export function parseLoadedTools(input: string): string[] | undefined {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return undefined;
  }
  const tools = trimmed
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);
  return tools.length > 0 ? [...new Set(tools)] : undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Throw descriptive errors for missing required inputs. Preserves exact
 * message text — these strings are part of the public contract.
 *
 * Exported so error messages can be asserted against without exercising
 * the full config-gathering pipeline.
 */
export function validateRequiredInputs(provider: string, model: string): void {
  if (!provider) {
    throw new Error(MISSING_PROVIDER_MESSAGE);
  }
  if (!model) {
    throw new Error(MISSING_MODEL_MESSAGE);
  }
}

/**
 * Validate the optional header used to carry the provider token.
 *
 * Header names use the RFC 9110 `token` grammar. Keeping this validation at
 * the action boundary prevents CRLF/header injection before the name reaches
 * the SDK's request headers. The token remains an opaque value and is never
 * interpolated into provider configuration.
 */
export function validateApiKeyHeader(apiKeyHeader: string, token: string): void {
  if (!apiKeyHeader) {
    return;
  }
  if (!HTTP_TOKEN_HEADER_NAME.test(apiKeyHeader)) {
    throw new Error('`api_key_header` must be a valid HTTP token header name.');
  }
  if (!token) {
    throw new Error('`api_key_header` requires a non-empty `token` input.');
  }
}

function validateReviewBudgets(
  convergeAfterSeconds: number | undefined,
  finalizeAfterSeconds: number | undefined
): void {
  if (
    convergeAfterSeconds !== undefined &&
    finalizeAfterSeconds !== undefined &&
    convergeAfterSeconds >= finalizeAfterSeconds
  ) {
    throw new Error(
      '`converge_after_seconds` must be less than `finalize_after_seconds` when both are set.'
    );
  }
}

function validateWorkspaceReadOnlyInputs(
  isolationMode: string,
  extensions: string[] | undefined,
  loadBuiltinExtensions: boolean,
  loadedTools: string[] | undefined,
  exportSessionHtml: boolean,
  exportSessionJsonl: boolean,
  shareSession: boolean
): void {
  if (!isolationMode) {
    return;
  }

  if (isolationMode !== WORKSPACE_READ_ONLY_MODE) {
    throw new Error(
      `Unsupported isolation_mode "${isolationMode}". ` +
        `Only "${WORKSPACE_READ_ONLY_MODE}" is supported.`
    );
  }

  validateWorkspaceReadOnlyPolicy({
    extensions,
    loadBuiltinExtensions,
    loadedTools,
    exportSessionHtml,
    exportSessionJsonl,
    shareSession,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Gather configuration from GitHub Action inputs.
 *
 * Validates that all required inputs are present and throws descriptive
 * errors when they are missing, so users see actionable guidance instead
 * of obscure downstream failures like "Model not found: /".
 *
 * @returns A fully populated PiConfig object.
 */
// fallow-ignore-next-line complexity
export function gatherActionsConfig(): PiConfig {
  // --- Required inputs ----------------------------------------------------
  const provider = core.getInput('provider');
  const model = core.getInput('model');
  const token = core.getInput('token');

  validateRequiredInputs(provider, model);

  if (!token) {
    core.debug('[config] No token provided — relying on provider-side auth (e.g. ADC)');
  }

  // --- Optional string inputs --------------------------------------------
  const promptInput = core.getInput('prompt');
  const thinkingLevel = core.getInput('thinking_level') ?? 'off';
  const baseUrl = core.getInput('base_url') || undefined;
  const apiKeyHeader = core.getInput('api_key_header').trim();
  const isolationMode = core.getInput('isolation_mode').trim();

  validateApiKeyHeader(apiKeyHeader, token);
  if (apiKeyHeader) {
    // The token is copied into an in-memory model header later. Register it
    // with Actions masking so accidental diagnostics cannot expose it.
    core.setSecret(token);
  }

  // --- Optional list inputs ----------------------------------------------
  const extensions = parseStringListInput(core.getInput('extensions'), '\n');
  const diffIgnorePatterns = parseStringListInput(core.getInput('diff_ignore_patterns'), /\s+/);
  const loadedTools = parseLoadedTools(core.getInput('loaded_tools'));

  // --- Optional boolean inputs -------------------------------------------
  const loadBuiltinExtensions = parseBooleanInput(core.getInput('load_builtin_extensions'), true);
  const exportSessionHtml = parseBooleanInput(core.getInput('export_session_html'), true);
  const exportSessionJsonl = parseBooleanInput(core.getInput('export_session_jsonl'), false);
  const autoCompaction = parseBooleanInput(core.getInput('auto_compaction'), false);
  const shareSession = parseBooleanInput(core.getInput('share_session'), false);

  validateWorkspaceReadOnlyInputs(
    isolationMode,
    extensions,
    loadBuiltinExtensions,
    loadedTools,
    exportSessionHtml,
    exportSessionJsonl,
    shareSession
  );

  // --- Session sharing storage backend inputs ---------------------------
  const shareGistProviderRaw = core.getInput('share_gist_provider').trim().toLowerCase();
  const shareGistProvider =
    shareGistProviderRaw === 'opengist'
      ? 'opengist'
      : shareGistProviderRaw === 'github'
        ? 'github'
        : undefined;
  // An unknown value (typo, or a backend we don't support yet) silently
  // collapses to the github default. Warn so a misconfigured provider is
  // visible instead of quietly creating a GitHub gist with ignored Opengist
  // config.
  if (shareGistProviderRaw && !shareGistProvider) {
    core.warning(
      `Unknown share_gist_provider "${shareGistProviderRaw}"; falling back to github. ` +
        'Valid values are "github" and "opengist".'
    );
  }
  const shareGistApiUrl = core.getInput('share_gist_api_url').trim() || undefined;
  const shareGistToken = core.getInput('share_gist_token').trim() || undefined;
  if (shareGistToken) {
    core.setSecret(shareGistToken);
  }

  // --- Optional positive-integer inputs ----------------------------------
  const diffMaxLines = parsePositiveIntInput(core.getInput('diff_max_lines'));
  const diffMaxBytes = parsePositiveIntInput(core.getInput('diff_max_bytes'));
  const prNumber = parsePositiveIntInput(core.getInput('pr_number'));
  const convergeAfterSeconds = parseReviewBudgetInput(
    'converge_after_seconds',
    core.getInput('converge_after_seconds')
  );
  const finalizeAfterSeconds = parseReviewBudgetInput(
    'finalize_after_seconds',
    core.getInput('finalize_after_seconds')
  );
  validateReviewBudgets(convergeAfterSeconds, finalizeAfterSeconds);

  // --- Session sharing inputs --------------------------------------------
  const githubToken = core.getInput('github_token') || undefined;
  // Register the token for log masking — it may be a PAT/App token with
  // elevated scopes (e.g. gist) that should never appear in clear text.
  if (githubToken) {
    core.setSecret(githubToken);
  }

  // --- Assemble PiConfig (only include optional keys when set) -----------
  return {
    provider,
    model,
    token,
    thinkingLevel,
    promptInput,
    ...(isolationMode ? { isolationMode: isolationMode as 'workspace-read-only' } : {}),
    ...(extensions?.length ? { extensions } : {}),
    loadBuiltinExtensions,
    ...(loadedTools ? { loadedTools } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKeyHeader ? { apiKeyHeader } : {}),
    exportSessionHtml,
    exportSessionJsonl,
    autoCompaction,
    shareSession,
    ...(shareGistProvider ? { shareGistProvider } : {}),
    ...(shareGistApiUrl ? { shareGistApiUrl } : {}),
    ...(shareGistToken ? { shareGistToken } : {}),
    ...(githubToken ? { githubToken } : {}),
    ...(diffMaxLines ? { diffMaxLines } : {}),
    ...(diffMaxBytes ? { diffMaxBytes } : {}),
    ...(diffIgnorePatterns?.length ? { diffIgnorePatterns } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(convergeAfterSeconds ? { convergeAfterSeconds } : {}),
    ...(finalizeAfterSeconds ? { finalizeAfterSeconds } : {}),
  };
}
