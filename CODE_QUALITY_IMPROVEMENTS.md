# Code Quality Analysis Report for `src/*`

## Executive Summary

This report contains recommendations for improving the code quality, maintainability, and robustness of the source code in the `src/` directory. The findings are categorized by severity and include specific actionable recommendations.

---

## 🔴 Critical Issues

### 1. Duplicate Variable Declaration in `src/prompts.ts`

**Location:** `src/prompts.ts`, lines 75-77 in `buildIssuePrompt` function

**Issue:**
```typescript
const comments = formatComments(issue.comments ?? [], commentId);  // Line 75
const comments = formatComments(issue.comments ?? [], commentId, ISSUE_COMMENT_INDENT);  // Line 77 (duplicate!)
```

**Impact:** The first declaration is immediately shadowed by the second, making the first line dead code. This is a bug that could cause issues if the behavior changes.

**Recommendation:** Remove the duplicate declaration:
```typescript
const comments = formatComments(issue.comments ?? [], commentId, ISSUE_COMMENT_INDENT);
```

---

## 🟡 High Priority Issues

### 2. Invalid Top-Level await in `src/validation.ts`

**Location:** `src/validation.ts`, `validateSafePath` function, line ~249

**Issue:**
```typescript
const { resolve } = await import('path');  // This is inside a function, not top-level
```

The function contains an `await import('path')` statement, but the file doesn't have top-level await enabled in `tsconfig.json`. This will cause a runtime error.

**Recommendation:** Either:
```typescript
// Option 1: Move import to top of file
import { resolve } from 'path';
// ... then use resolve() directly
```

Or if dynamic import is needed:
```typescript
// Option 2: Make the function async
export async function validateSafePath(filepath: string, basePath?: string): Promise<void> {
  // ... existing code
  if (basePath) {
    const { resolve } = await import('path');
    // ... rest of code
  }
}
```

### 3. Inconsistent Error Handling

**Issue:** Some functions throw generic `Error` objects instead of using the well-designed custom error classes in `src/errors.ts`.

**Examples:**
- `src/utils.ts`: `runCommand` throws generic `Error`
- `src/git.ts`: `commitAndPush` throws generic `Error` for invalid repository context
- `src/gh.ts`: `cli` method throws generic `Error`

**Recommendation:** Use the custom error classes consistently:
```typescript
import { createGitOperationError, createValidationError } from './errors.js';

// In runCommand
throw new Error(`Command failed: ...`);  // Current
// Change to:
throw createGitOperationError(cmd.join(' '), new Error(`Exit code: ${result.status}`));
```

---

## 🟢 Medium Priority Issues

### 4. Missing Validation in Some Functions

**Location:** Various files

**Issue:** Some functions don't validate their inputs, even though validation utilities exist in `src/validation.ts`.

**Examples:**
- `src/gh.ts`: `createPR`, `createComment` don't validate `issueNumber` or `body`
- `src/git.ts`: `checkoutBranch` doesn't validate `branch` parameter
- `src/pi.ts`: `runPi` doesn't validate `prompt` length

**Recommendation:** Add validation calls at function entry points:
```typescript
import { validateIssueNumber, validateBranchName } from './validation.js';

async function checkoutBranch(branch: string): Promise<void> {
  validateBranchName(branch);  // Add validation
  // ... rest of implementation
}
```

### 5. Weak Type Safety in Some Areas

**Location:** `src/types.ts`

**Issue:** Some type definitions could be more specific to catch bugs at compile time.

**Recommendation:** Use more specific types:
```typescript
// Current
export interface IssueNode {
  state: string;  // Too broad
}

// Better
export type IssueState = 'OPEN' | 'CLOSED';
export interface IssueNode {
  state: IssueState;
}
```

### 6. Unused Constants and Imports

**Issue:** Some constants are defined but not used throughout the codebase.

**Recommendation:** Review and remove unused code:
- Check if `REVIEW_COMMENT_INDENT` is actually needed
- Review `INSTRUCTIONS_MESSAGE` usage pattern

### 7. Magic Numbers and String Literals

**Issue:** Some magic numbers and string literals are not extracted to constants.

**Examples:**
- `src/pi.ts`: `line 72-73` - Timeout and retry logic uses magic numbers
- `src/utils.ts`: Error messages contain hardcoded strings

**Recommendation:** Extract to named constants:
```typescript
const DEFAULT_GIT_TIMEOUT_MS = 10_000;
const MAX_COMMAND_RETRIES = 3;
```

---

## 🔵 Low Priority / Best Practices

### 8. Inconsistent JSDoc Comments

**Issue:** Some exported functions lack JSDoc comments or have incomplete documentation.

**Examples:**
- `src/gh.ts`: `cli` method lacks JSDoc
- `src/git.ts`: Some helper methods lack documentation

**Recommendation:** Add comprehensive JSDoc to all public APIs following the existing pattern.

### 9. Module-Level Documentation

**Issue:** Most files lack module-level JSDoc explaining the purpose and architecture.

**Recommendation:** Add module-level documentation:
```typescript
/**
 * @module gh
 * @description Provides GitHub API integration using both GitHub CLI and Octokit.
 *
 * This module implements a client pattern for interacting with GitHub resources,
 * including issues, pull requests, comments, and reactions. It uses the GitHub CLI
 * for data retrieval and Octokit for write operations.
 */
```

### 10. Test Coverage Gaps

**Location:** Test files

**Issue:** Some tests are incomplete or don't verify actual functionality.

**Examples:**
- `src/git.test.ts`: `checkoutBranch` test only checks if function exists
- Missing edge case tests for error conditions

**Recommendation:** Enhance test coverage:
```typescript
// Instead of:
it('should be callable', async () => {
  expect(typeof gitService.checkoutBranch).toBe('function');
});

// Use:
it('should create and checkout a new branch', async () => {
  const branchName = 'test-branch-' + Date.now();
  await gitService.checkoutBranch(branchName);
  // Verify branch was created and checked out
});
```

### 11. Console Logging vs Core Logging

**Issue:** The project uses both `console.log` and `core.*` from `@actions/core`.

**Recommendation:** Standardize on `@actions/core` logging for GitHub Actions:
```typescript
// Instead of:
console.log('Message');

// Use:
core.info('Message');
```

### 12. Error Messages Could Be More Actionable

**Issue:** Some error messages don't provide enough context for debugging.

**Recommendation:** Enhance error messages with actionable information:
```typescript
// Current:
throw new Error('Invalid repository context');

// Better:
throw new Error(
  `Invalid repository context: owner="${owner}", repo="${repo}". ` +
  'Ensure the action is running in a GitHub repository context. ' +
  'Cannot construct push URL.'
);
```

### 13. Resource Cleanup

**Issue:** Some async operations don't have proper cleanup in error cases.

**Example:** `src/pi.ts`: Temp files are cleaned up in `finally`, but other resources might not be.

**Recommendation:** Review all resource allocation for proper cleanup patterns.

### 14. ESLint Configuration Enhancement

**Issue:** The ESLint config could be enhanced with additional rules for better code quality.

**Recommendations:**
- Add `@typescript-eslint/no-floating-promises` (already there, but check enforcement)
- Consider adding `@typescript-eslint/no-unnecessary-condition`
- Add `import/order` for consistent import ordering
- Consider adding `@typescript-eslint/consistent-type-imports`

### 15. Dependency Review

**Issue:** Review dependencies for:
- Security vulnerabilities
- Unused dependencies
- Alternative smaller packages

**Recommendation:** Run `bun audit` and review dependency tree.

---

## 📊 Summary by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Bugs | 1 | 1 | 0 | 0 | 2 |
| Error Handling | 0 | 1 | 1 | 2 | 4 |
| Type Safety | 0 | 0 | 1 | 1 | 2 |
| Testing | 0 | 0 | 1 | 1 | 2 |
| Documentation | 0 | 0 | 0 | 3 | 3 |
| Best Practices | 0 | 0 | 4 | 4 | 8 |
| **Total** | **1** | **2** | **7** | **11** | **21** |

---

## 🎯 Recommended Action Plan

1. **Immediate (Next Sprint):**
   - Fix duplicate variable declaration in `src/prompts.ts`
   - Fix the `await import('path')` issue in `src/validation.ts`
   - Add missing input validations

2. **Short-term (Next 2-3 Sprints):**
   - Refactor error handling to use custom error classes
   - Improve type safety with more specific types
   - Enhance test coverage for critical paths

3. **Medium-term (Next Quarter):**
   - Add comprehensive JSDoc documentation
   - Standardize logging patterns
   - Review and remove unused code
   - Enhance ESLint configuration

4. **Long-term (Ongoing):**
   - Regular dependency audits
   - Continuous code review improvements
   - Architecture documentation

---

## 📝 Additional Notes

The codebase is generally well-structured with good separation of concerns. The custom error handling system in `src/errors.ts` is well-designed but underutilized. The TypeScript configuration is strict and follows best practices. With the fixes recommended above, the code quality would significantly improve.
