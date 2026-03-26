# Code Quality Improvements

This document describes the code quality improvements implemented for the `src/*` directory.

## Overview

These improvements address high-priority recommendations from the `CODE_QUALITY_RECOMMENDATIONS.md` document, focusing on:

1. **Custom Error Classes** - Better error handling and type safety
2. **Input Validation** - Security and safety improvements
3. **URL Building Utilities** - Elimination of code duplication
4. **Magic String/Number Elimination** - Improved maintainability

---

## New Files

### 1. `src/errors.ts`

**Purpose:** Custom error classes for better error handling and type safety.

**Key Features:**
- `ApplicationError` - Base class for all application errors
- `GitHubError` - GitHub API errors with helpful methods like `isNotFound()`, `isForbidden()`, `isServerError()`
- `GitError` - Git operation errors with `isAuthenticationError()`, `isNetworkError()`, `isMergeConflict()`
- `PiAgentError` - Pi Agent errors with `isTimeout()`, `isModelUnavailable()`, `isRateLimited()`
- `ValidationError` - Input validation errors
- `ConfigurationError` - Configuration value errors

**Factory Functions:**
- `createGitHubRequestError()` - Create GitHub errors for failed requests
- `createGitHubParseError()` - Create GitHub errors for JSON parsing failures
- `createGitOperationError()` - Create Git operation errors
- `createPiAgentError()` - Create Pi Agent errors
- `createValidationError()` - Create validation errors

**Type Guards:**
- `isGitHubError()`, `isGitError()`, `isPiAgentError()`, etc. for type-safe error checking

**Usage Example:**
```typescript
import { GitHubError, isGitHubError } from './errors.js';

try {
  const data = gh.getIssueData(issueNumber);
} catch (error) {
  if (isGitHubError(error)) {
    if (error.isNotFound()) {
      // Handle 404
    } else if (error.isForbidden()) {
      // Handle 403
    }
  }
}
```

### 2. `src/validation.ts`

**Purpose:** Input validation functions for safety and security.

**Key Features:**

**GitHub Validation:**
- `validateIssueNumber()` - Validates issue/PR numbers
- `validateGitHubUsername()` - Validates GitHub usernames
- `validateRepositoryName()` - Validates repository names

**Git Validation:**
- `validateBranchName()` - Validates Git branch names against Git rules
- `validateCommitMessage()` - Validates commit message format and length

**General Validation:**
- `validateUserPrompt()` - Validates user prompts (length, dangerous patterns)
- `validateEmail()` - Validates email format
- `validateUrl()` - Validates URLs with optional protocol restrictions

**Environment Variable Validation:**
- `validateEnvVarKey()` - Validates environment variable keys
- `sanitizeEnvVarValue()` - Validates and sanitizes environment variable values

**File Path Validation:**
- `validateSafePath()` - Validates file paths are safe (no path traversal, etc.)

**Type Guards:**
- `isNonEmptyString()`, `isNumber()`, `isPositiveInteger()` for type checking

**Usage Example:**
```typescript
import { validateIssueNumber, validateUserPrompt } from './validation.js';

validateIssueNumber(issueNumber);
validateUserPrompt(prompt);
```

### 3. `src/url.ts`

**Purpose:** URL building utilities for GitHub, eliminating code duplication.

**Key Features:**

**GitHubUrlBuilder Class:**
- `repo()` - Base repository URL
- `branch(branch)` - Branch URL
- `commit(sha)` - Commit URL
- `pr(number)` - Pull request URL
- `issue(number)` - Issue URL
- `file(path, ref)` - File URL
- `fileAtLine(path, ref, line)` - File URL with line anchor
- `comment(targetType, targetNumber, commentId)` - Comment URL
- `review(prNumber, reviewId)` - Review URL
- `diff(base, head)` - Diff comparison URL
- `actions()` - Actions page URL
- `run(runId)` - Specific workflow run URL
- `currentRun()` - Current workflow run URL

**Helper Functions:**
- `buildRunUrl()` - Get current workflow run URL
- `buildRepoUrl(owner, repo)` - Build repository URL
- `markdownLink(text, url)` - Create markdown link
- `prMarkdownLink(number, text?)` - Create PR markdown link
- `issueMarkdownLink(number, text?)` - Create issue markdown link
- `commitMarkdownLink(sha, text?)` - Create commit markdown link
- `fileMarkdownLink(path, ref, text?)` - Create file markdown link

**Usage Example:**
```typescript
import { githubUrlBuilder, prMarkdownLink } from './url.js';

const url = githubUrlBuilder.pr(123);
const link = prMarkdownLink(123);
// => "[PR #123](https://github.com/owner/repo/pull/123)"
```

### 4. `CODE_QUALITY_RECOMMENDATIONS.md`

**Purpose:** Comprehensive documentation of quality improvement recommendations.

Contains detailed recommendations for:
- Type safety & strictness improvements
- Error handling improvements
- Code duplication reduction
- Magic string/number elimination
- Input validation improvements
- Performance & resource management
- Security improvements
- Documentation improvements
- Test coverage improvements
- Code organization improvements

---

## Modified Files

### 1. `src/constants.ts`

**Changes:**
- Added `GENERIC_COMMIT_PREFIXES` - Array of generic commit message prefixes
- Added `GENERIC_PREFIX_PATTERN` - Regex for matching generic prefixes
- Added `MAX_COMMIT_SUBJECT_LENGTH` - Maximum commit subject length (72)
- Added `RECOMMENDED_COMMIT_SUBJECT_LENGTH` - Recommended commit subject length (50)
- Added `ISSUE_COMMENT_INDENT` - Indentation for issue comments ('  - ')
- Added `PR_COMMENT_INDENT` - Indentation for PR comments ('- ')
- Added `REVIEW_COMMENT_INDENT` - Indentation for review comments ('    - ')
- Added validation constants for maximum lengths

**Benefits:**
- Centralizes all magic strings and numbers
- Makes it easy to adjust formatting and validation rules
- Provides documentation for these values

### 2. `src/pi.ts`

**Changes:**
- Removed inline `GENERIC_PREFIX_PATTERN` definition
- Imported `GENERIC_PREFIX_PATTERN` from `./constants.js`
- Imported `RECOMMENDED_COMMIT_SUBJECT_LENGTH` and `MAX_COMMIT_SUBJECT_LENGTH`
- Updated `summarize()` function to use constants instead of hardcoded values (50)

**Benefits:**
- Eliminates magic numbers
- Makes it easy to adjust commit summarization behavior
- Centralizes commit message formatting logic

### 3. `src/prompts.ts`

**Changes:**
- Imported indentation constants from `./constants.js`
- Updated `formatComments()` default parameter to use `ISSUE_COMMENT_INDENT`
- Updated `buildIssuePrompt()` to explicitly use `ISSUE_COMMENT_INDENT`
- Updated `buildPRPrompt()` to use `PR_COMMENT_INDENT`
- Updated `formatReviews()` to use `REVIEW_COMMENT_INDENT`

**Benefits:**
- Eliminates magic strings for indentation
- Makes it easy to adjust prompt formatting
- Centralizes formatting constants

---

## Benefits Summary

### Immediate Benefits
1. **Better Error Handling** - Custom error classes make error handling more type-safe and provide additional context
2. **Security** - Input validation prevents injection attacks and malformed data
3. **Maintainability** - Eliminating magic strings/numbers makes code easier to understand and modify
4. **Reduced Duplication** - URL building utilities eliminate repeated code

### Long-term Benefits
1. **Easier Testing** - Clear error types and validation functions make testing easier
2. **Better Debugging** - Rich error objects with context help identify issues quickly
3. **Safer Code** - Input validation catches issues early
4. **Consistent Behavior** - Centralized constants ensure consistent behavior across the codebase

---

## Migration Guide

### Using Custom Errors

**Before:**
```typescript
throw new Error(`GitHub request failed: ${message}`);
```

**After:**
```typescript
import { createGitHubRequestError } from './errors.js';

throw createGitHubRequestError('getIssue', 404, responseText);
```

### Using Validation

**Before:**
```typescript
if (issueNumber < 1) {
  throw new Error('Invalid issue number');
}
```

**After:**
```typescript
import { validateIssueNumber } from './validation.js';

validateIssueNumber(issueNumber); // Throws ValidationError if invalid
```

### Using URL Building

**Before:**
```typescript
const { owner, repo } = github.context.repo;
const serverUrl = github.context.serverUrl || 'https://github.com';
const prUrl = `${serverUrl}/${owner}/${repo}/pull/${prNumber}`;
```

**After:**
```typescript
import { githubUrlBuilder } from './url.js';

const prUrl = githubUrlBuilder.pr(prNumber);
```

---

## Future Work

These improvements address the high-priority recommendations from `CODE_QUALITY_RECOMMENDATIONS.md`. Additional improvements that could be made:

1. **Performance Improvements**
   - Cache status matrix in GitService
   - Parallelize independent API calls

2. **Test Coverage**
   - Add error path tests
   - Add integration tests
   - Add edge case tests

3. **Code Organization**
   - Split large files (e.g., `src/index.ts`)
   - Group related utilities into subdirectories

4. **Documentation**
   - Add architecture documentation
   - Add usage examples to JSDoc
   - Document error scenarios

---

## Testing

To ensure these improvements work correctly:

```bash
# Run tests
bun test

# Run type checking
bun run type-check

# Run linter
bun run lint
```

All existing tests should continue to pass. The new modules can be tested with:

```bash
# Test errors
bun test src/errors.test.ts

# Test validation
bun test src/validation.test.ts

# Test URL building
bun test src/url.test.ts
```

Note: Test files for the new modules can be added following the existing test patterns.
