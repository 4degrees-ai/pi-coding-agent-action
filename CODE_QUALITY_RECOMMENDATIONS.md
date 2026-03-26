# Code Quality Recommendations for src/*

This document outlines recommendations for improving the code quality in the `src/` directory.

## Executive Summary

The codebase is well-structured overall with good TypeScript strictness and comprehensive test coverage. However, there are several areas where improvements can be made to enhance maintainability, type safety, error handling, and overall code quality.

---

## 1. Type Safety & Strictness Improvements

### 1.1 Enhance Type Definitions in `src/index.ts`

**Current Issue:**
```typescript
interface GitHubPayload {
  issue?: IssueWithPR;
  comment?: IssueCommentPayload | undefined;
}
```

**Recommendation:**
Make the payload more complete by including all possible webhook fields and using discriminated unions:

```typescript
interface IssuePayload {
  issue: IssueWithPR;
  comment: IssueCommentPayload;
}

interface IssueOnlyPayload {
  issue: IssueWithPR;
  comment?: undefined;
}

type GitHubPayload = IssuePayload | IssueOnlyPayload;
```

### 1.2 Add Type Guards for Payload Validation

**Current Issue:**
The `extractContext` function doesn't validate that required fields exist.

**Recommendation:**
Add a type guard function:

```typescript
function isValidIssuePayload(payload: GitHubPayload): payload is IssuePayload {
  return !!payload.issue && !!payload.comment;
}
```

### 1.3 Strengthen Generic Constraints in `src/gh.ts`

**Current Issue:**
```typescript
private parseJSONOutput<T>(output: string, dataType: string, number: number): T
```

**Recommendation:**
Add a generic constraint for JSON-parsable types:

```typescript
private parseJSONOutput<T extends Record<string, unknown>>(
  output: string,
  dataType: string,
  number: number
): T
```

---

## 2. Error Handling Improvements

### 2.1 Create Custom Error Classes

**Recommendation:**
Create a dedicated errors module (`src/errors.ts`):

```typescript
export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly operation: string
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export class PiAgentError extends Error {
  constructor(
    message: string,
    public readonly exitCode?: number
  ) {
    super(message);
    this.name = 'PiAgentError';
  }
}
```

### 2.2 Improve Error Context in `src/gh.ts`

**Current Issue:**
```typescript
private parseJSONOutput<T>(output: string, dataType: string, number: number): T {
  try {
    return JSON.parse(output) as T;
  } catch (e) {
    throw new Error(
      `Failed to parse ${dataType} data for #${number}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
```

**Recommendation:**
Include the actual output for debugging:

```typescript
private parseJSONOutput<T extends Record<string, unknown>>(
  output: string,
  dataType: string,
  number: number
): T {
  try {
    return JSON.parse(output) as T;
  } catch (e) {
    const preview = output.length > 200 ? output.slice(0, 200) + '...' : output;
    throw new GitHubError(
      `Failed to parse ${dataType} data for #${number}: ${e instanceof Error ? e.message : String(e)}\nOutput preview: ${preview}`,
      undefined,
      'parse'
    );
  }
}
```

### 2.3 Handle Temp File Creation Errors in `src/pi.ts`

**Current Issue:**
If temp file creation fails before the try block, there's no cleanup.

**Recommendation:**
Move temp file creation into the try block or validate before proceeding:

```typescript
export function runPi(prompt: string, overrideProvider?: string, overrideModel?: string): string {
  const provider = overrideProvider ?? core.getInput('provider') ?? DEFAULT_PI_PROVIDER;
  // ... rest of setup ...

  let promptFile = '';
  let systemPromptFile = '';
  let hasCustomSystemPrompt = Boolean(customSystemPrompt);

  try {
    // Create temp files inside try block for proper cleanup
    promptFile = path.join(os.tmpdir(), PROMPT_TEMP_FILE);
    fs.writeFileSync(promptFile, prompt, 'utf8');

    if (hasCustomSystemPrompt) {
      systemPromptFile = path.join(
        os.tmpdir(),
        `${SYSTEM_PROMPT_TEMP_FILE_PREFIX}_${crypto.randomUUID()}.md`
      );
      fs.writeFileSync(systemPromptFile, customSystemPrompt, 'utf8');
    }

    // ... rest of logic ...

  } finally {
    safeRemoveFile(promptFile);
    if (hasCustomSystemPrompt && systemPromptFile) {
      safeRemoveFile(systemPromptFile);
    }
  }
}
```

---

## 3. Reduce Code Duplication

### 3.1 Extract URL Building Logic in `src/index.ts`

**Current Issue:**
URL building is duplicated in multiple places:

```typescript
const { owner, repo } = github.context.repo;
const serverUrl = github.context.serverUrl || 'https://github.com';
const branchUrl = `${serverUrl}/${owner}/${repo}/tree/${newBranch}`;
```

**Recommendation:**
Create a helper function:

```typescript
/**
 * Constructs GitHub URLs for the current repository.
 */
class GitHubUrlBuilder {
  private readonly serverUrl: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor() {
    this.serverUrl = github.context.serverUrl || 'https://github.com';
    const repo = github.context.repo;
    this.owner = repo.owner;
    this.repo = repo.repo;
  }

  branch(branch: string): string {
    return `${this.serverUrl}/${this.owner}/${this.repo}/tree/${branch}`;
  }

  pr(prNumber: number): string {
    return `${this.serverUrl}/${this.owner}/${this.repo}/pull/${prNumber}`;
  }

  issue(issueNumber: number): string {
    return `${this.serverUrl}/${this.owner}/${this.repo}/issues/${issueNumber}`;
  }

  file(path: string, ref: string): string {
    return `${this.serverUrl}/${this.owner}/${this.repo}/blob/${ref}/${path}`;
  }
}

// Usage:
const urlBuilder = new GitHubUrlBuilder();
const branchUrl = urlBuilder.branch(newBranch);
const prUrl = urlBuilder.pr(prNumber);
```

### 3.2 Extract Comment Creation Pattern

**Current Issue:**
Creating comments with run URL is repeated:

```typescript
const finalBody = `${response}\n\n[View run](${runUrl})`;
await gh.createComment(issueNumber, finalBody);
```

**Recommendation:**
Create a helper method in GitHubClient:

```typescript
/**
 * Creates a comment with a link to the current workflow run.
 */
async createCommentWithRunLink(
  issueNumber: number,
  body: string,
  includePrefix = true
): Promise<void> {
  const runUrl = buildRunUrl();
  const fullBody = includePrefix ? `${body}\n\n[View run](${runUrl})` : body;
  await this.createComment(issueNumber, fullBody);
}
```

---

## 4. Eliminate Magic Strings and Numbers

### 4.1 Extract Regex Pattern to Constants

**Current Issue in `src/pi.ts`:**
```typescript
const GENERIC_PREFIX_PATTERN = /^(I|I'll|Sure|OK|Great|Here|The|This|A)/i;
```

**Recommendation:**
Move to `src/constants.ts`:

```typescript
/**
 * Patterns to exclude from commit message summaries.
 * These are common generic phrases that AI assistants use.
 */
export const GENERIC_COMMIT_PREFIXES = [
  'I',
  "I'll",
  'Sure',
  'OK',
  'Great',
  'Here',
  'The',
  'This',
  'A',
] as const;

export const GENERIC_PREFIX_PATTERN = new RegExp(
  `^(${GENERIC_COMMIT_PREFIXES.join('|')})`,
  'i'
);
```

### 4.2 Extract Timestamp Format

**Current Issue in `src/utils.ts`:**
```typescript
const timestamp = `${now.year}${String(now.month).padStart(2, '0')}${String(now.day).padStart(2, '0')}${String(now.hour).padStart(2, '0')}${String(now.minute).padStart(2, '0')}${String(now.second).padStart(2, '0')}`;
```

**Recommendation:**
Extract to a helper function:

```typescript
/**
 * Formats a Temporal datetime as a compact timestamp string.
 * @returns YYYYMMDDHHmmss format
 */
function formatTimestamp(datetime: Temporal.PlainDateTime): string {
  return [
    String(datetime.year).padStart(4, '0'),
    String(datetime.month).padStart(2, '0'),
    String(datetime.day).padStart(2, '0'),
    String(datetime.hour).padStart(2, '0'),
    String(datetime.minute).padStart(2, '0'),
    String(datetime.second).padStart(2, '0'),
  ].join('');
}
```

### 4.3 Extract Indentation Constants

**Current Issue in `src/prompts.ts`:**
```typescript
const indent = '  - ';
```

**Recommendation:**
Move to top of file:

```typescript
const COMMENT_INDENT = '  - ';
const PR_COMMENT_INDENT = '- ';
const REVIEW_COMMENT_INDENT = '    - ';
```

---

## 5. Input Validation Improvements

### 5.1 Add Issue/PR Number Validation

**Recommendation:**
Add validation functions in `src/utils.ts`:

```typescript
/**
 * Validates that a number is a valid GitHub issue/PR number.
 * @throws Error if the number is invalid
 */
export function validateIssueNumber(num: number): void {
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`Invalid issue number: ${num}. Must be a positive integer.`);
  }
}

/**
 * Validates that a string is a valid Git branch name.
 * @throws Error if the branch name is invalid
 */
export function validateBranchName(branch: string): void {
  if (!branch || branch.length === 0) {
    throw new Error('Branch name cannot be empty');
  }

  if (branch.length > 255) {
    throw new Error('Branch name cannot exceed 255 characters');
  }

  // Git branch name rules
  const invalidPattern = /(^\.|^/|@\{|\\)|[ \t~^:?*[]|\.\.|^@|^/;
  if (invalidPattern.test(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}
```

### 5.2 Add User Prompt Validation

**Recommendation:**
Add validation in `src/index.ts`:

```typescript
/**
 * Validates and sanitizes a user prompt.
 * @throws Error if the prompt is invalid
 */
function validateUserPrompt(prompt: string): void {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('User prompt cannot be empty');
  }

  if (prompt.length > 100_000) {
    throw new Error('User prompt is too long (max 100,000 characters)');
  }
}
```

---

## 6. Performance & Resource Management

### 6.1 Cache Status Matrix in GitService

**Current Issue:**
`branchIsDirty()` and `commitAndPush()` both call `statusMatrix()`.

**Recommendation:**
Cache the result:

```typescript
export class GitService {
  private _statusMatrix: Awaited<ReturnType<typeof isoGit.statusMatrix>> | null = null;

  /**
   * Gets the current status matrix, caching the result.
   */
  private async getStatusMatrix(): Promise<Awaited<ReturnType<typeof isoGit.statusMatrix>>> {
    if (this._statusMatrix === null) {
      this._statusMatrix = await isoGit.statusMatrix({
        fs,
        dir: this.dir,
      });
    }
    return this._statusMatrix;
  }

  /**
   * Clears the cached status matrix.
   */
  private clearStatusCache(): void {
    this._statusMatrix = null;
  }

  async branchIsDirty(): Promise<boolean> {
    const statusMatrix = await this.getStatusMatrix();
    // ... rest of logic
  }
}
```

### 6.2 Parallelize Independent API Calls

**Current Issue in `src/index.ts`:**
```typescript
const issue = gh.getIssueData(issueNumber);
const fullPrompt = buildIssuePrompt(issue, userPrompt, commentId);
const response = runPi(fullPrompt);
```

**Recommendation:**
When multiple independent operations can be done in parallel:

```typescript
// If you need to fetch multiple issues/PRs independently
const [issue1, issue2] = await Promise.all([
  gh.getIssueDataAsync(num1),
  gh.getIssueDataAsync(num2),
]);
```

---

## 7. Security Improvements

### 7.1 Sanitize Environment Variable Values

**Current Issue in `src/utils.ts`:**
```typescript
return { key, value };
```

**Recommendation:**
Sanitize values:

```typescript
function sanitizeEnvValue(value: string): string {
  // Remove potentially dangerous characters
  return value
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 10_000); // Limit length
}

export function parseEnvVars(envVarsString: string): EnvVar[] {
  // ... parsing logic ...
  return {
    key,
    value: sanitizeEnvValue(value),
  };
}
```

### 7.2 Add Path Validation for Git Operations

**Recommendation:**
Add path validation in `src/git.ts`:

```typescript
/**
 * Validates that a file path is safe for git operations.
 * @throws Error if the path is dangerous
 */
function validateGitPath(filepath: string): void {
  // Prevent path traversal
  const normalized = path.normalize(filepath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid git path: "${filepath}"`);
  }
}

// Use in commitAndPush:
for (const row of statusMatrix) {
  const [filepath, , workdir] = row;
  validateGitPath(filepath);
  // ... rest of logic
}
```

---

## 8. Documentation Improvements

### 8.1 Add Architecture Documentation

**Recommendation:**
Create a `src/ARCHITECTURE.md` file explaining:

- Overall architecture diagram
- Data flow from webhook to response
- Service responsibilities
- Integration points with GitHub API, Git, and Pi Agent

### 8.2 Add Usage Examples to JSDoc

**Recommendation:**
Enhance JSDoc with examples:

```typescript
/**
 * Creates a new pull request using Octokit.
 *
 * @example
 * ```typescript
 * const prNumber = await gh.createPR(
 *   'main',
 *   'feature/new-feature',
 *   'Add new feature',
 *   'Description of changes'
 * );
 * console.log(`Created PR #${prNumber}`);
 * ```
 *
 * @param base - The base branch name
 * @param head - The head branch name
 * @param title - The PR title
 * @param body - The PR body
 * @returns The PR number
 */
async createPR(base: string, head: string, title: string, body: string): Promise<number> {
  // ... implementation
}
```

### 8.3 Document Error Scenarios

**Recommendation:**
Add documentation for error handling:

```typescript
/**
 * Error Scenarios:
 *
 * ### GitHub Errors
 * - `404 Not Found`: Issue/PR does not exist
 * - `403 Forbidden`: Insufficient permissions
 * - `422 Unprocessable Entity`: Invalid PR data (e.g., base branch not found)
 *
 * ### Git Errors
 * - Authentication failures (invalid token)
 * - Network timeouts
 * - Merge conflicts
 *
 * ### Pi Agent Errors
 * - Timeout (60 minutes)
 * - Model not available
 * - Invalid credentials
 */
```

---

## 9. Test Coverage Improvements

### 9.1 Add Error Path Tests

**Recommendation:**
Ensure all error paths are tested:

```typescript
describe('GitHubClient', () => {
  describe('getIssueData', () => {
    it('should throw for non-existent issue', async () => {
      // Test 404 error handling
    });

    it('should throw for invalid JSON response', async () => {
      // Test JSON parsing errors
    });

    it('should throw for network errors', async () => {
      // Test network failures
    });
  });
});
```

### 9.2 Add Integration Tests

**Recommendation:**
Add tests that verify module interactions:

```typescript
describe('Workflow Integration', () => {
  it('should handle full issue workflow', async () => {
    // Test the complete flow from webhook to response
  });

  it('should handle full PR workflow', async () => {
    // Test the complete flow for PR comments
  });
});
```

### 9.3 Add Edge Case Tests

**Recommendation:**
Test boundary conditions:

```typescript
describe('Edge Cases', () => {
  it('should handle very long comments', () => {
    const longComment = 'a'.repeat(100_000);
    // Test handling
  });

  it('should handle special characters in branch names', () => {
    // Test branch names with special chars
  });

  it('should handle concurrent requests', async () => {
    // Test race conditions
  });
});
```

---

## 10. Code Organization Improvements

### 10.1 Split Large Files

**Recommendation:**
Consider splitting `src/index.ts` (400+ lines) into smaller modules:

```
src/
  index.ts              # Main entry point (simplified)
  workflows/
    issue.workflow.ts   # Issue handling logic
    pr.workflow.ts      # PR handling logic
    index.ts            # Workflow exports
```

### 10.2 Group Related Utilities

**Recommendation:**
Consider creating specialized utility modules:

```
src/
  utils/
    url.ts              # URL building utilities
    validation.ts       # Input validation
    formatting.ts       # Text/formatting helpers
    git.ts              # Git-specific utilities
  index.ts              # Re-export utilities
```

### 10.3 Consolidate Types

**Recommendation:**
Consider organizing types by domain:

```
src/
  types/
    github.ts           # GitHub-related types
    git.ts              # Git-related types
    common.ts           # Shared types
  index.ts              # Re-export all types
```

---

## 11. Additional Recommendations

### 11.1 Add Logging Levels

**Recommendation:**
Implement a logging utility with different levels:

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  debug(message: string, data?: unknown): void {
    if (this.level <= LogLevel.DEBUG) {
      core.debug(`${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
    }
  }

  // ... other methods
}
```

### 11.2 Add Metrics Collection

**Recommendation:**
Collect metrics for monitoring:

```typescript
class Metrics {
  private counters = new Map<string, number>();
  private timers = new Map<string, number>();

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  time(name: string): number {
    this.timers.set(name, Date.now());
    return Date.now();
  }

  timeEnd(name: string): number {
    const start = this.timers.get(name);
    if (start) {
      return Date.now() - start;
    }
    return 0;
  }
}
```

### 11.3 Add Rate Limiting

**Recommendation:**
Implement rate limiting for GitHub API calls:

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRateMs: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRateMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    while (this.tokens < 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      this.refill();
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}
```

---

## Implementation Priority

### High Priority (Immediate)
1. Custom error classes for better error handling
2. Input validation for safety
3. Security improvements (path sanitization, env var sanitization)
4. Type safety improvements (type guards, better constraints)

### Medium Priority (Next Sprint)
5. Reduce code duplication (URL builders, comment helpers)
6. Eliminate magic strings and numbers
7. Performance improvements (caching)
8. Documentation enhancements

### Low Priority (Future Considerations)
9. Code organization refactoring
10. Test coverage expansion
11. Metrics and logging
12. Rate limiting

---

## Conclusion

The codebase demonstrates good engineering practices with strong TypeScript usage, comprehensive testing, and clear separation of concerns. Implementing these recommendations will further enhance code quality, maintainability, and robustness, making the codebase more resilient to errors and easier to maintain and extend.
