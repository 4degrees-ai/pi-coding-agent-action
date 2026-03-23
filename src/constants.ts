// ── Constants ─────────────────────────────────────────────────────

/**
 * Timeout for pi agent execution in milliseconds (60 minutes).
 */
export const PI_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Timeout for GitHub CLI operations in milliseconds (10 seconds).
 */
export const GH_TIMEOUT_MS = 10 * 1000;

/**
 * Default GitHub branch name.
 */
export const DEFAULT_GITHUB_BRANCH = 'main';

// ── Pi Agent Defaults ─────────────────────────────────────────────
/**
 * Default LLM provider for the pi agent.
 */
export const DEFAULT_PI_PROVIDER = 'anthropic';

/**
 * Default model for the pi agent.
 */
export const DEFAULT_PI_MODEL = 'claude-sonnet-4-5';

/**
 * Default mention trigger for the pi agent.
 */
export const DEFAULT_MENTION = '/pi';

// ── Git Constants ─────────────────────────────────────────────────
/**
 * Branch prefix for pi agent operations.
 */
export const PI_BRANCH_PREFIX = 'pi';

/**
 * Default committer name for git commits made by the pi agent.
 */
export const DEFAULT_COMMITTER_NAME = 'pi-agent[bot]';

/**
 * Default committer email for git commits made by the pi agent.
 */
export const DEFAULT_COMMITTER_EMAIL = 'pi-agent[bot]@users.noreply.github.com';

// ── GitHub API Constants ───────────────────────────────────────────
/**
 * GitHub reactions available for use.
 */
export const GITHUB_REACTIONS = [
  '+1',
  '-1',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes',
] as const;

/**
 * Type of GitHub reaction.
 */
export type GitHubReaction = (typeof GITHUB_REACTIONS)[number];

// ── Temp File Constants ────────────────────────────────────────────
/**
 * Base name for the pi prompt temp file.
 */
export const PROMPT_TEMP_FILE = 'pi_prompt.md';

/**
 * Prefix for the pi system prompt temp file.
 */
export const SYSTEM_PROMPT_TEMP_FILE_PREFIX = 'pi_system';
