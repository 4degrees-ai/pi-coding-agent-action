/**
 * Unit tests for the pure helpers extracted from `pull-request.ts`
 * in Step 2.13 (createPullRequest refactor).
 *
 * The main `createPullRequest` and `prepareBranchAndCreatePR` are async
 * orchestrators that drive the GitHub API; they're covered indirectly by
 * the existing integration tests. These tests cover the pure formatters
 * that build messages and structured results.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCreateDryRunMessage,
  buildCreateDryRunResult,
  buildCreateSuccessMessage,
  buildCreateSuccessResult,
  formatCreateError,
} from '@alexanderfortin/pi-platform-github';

// ---------------------------------------------------------------------------
// buildCreateDryRunMessage
// ---------------------------------------------------------------------------

describe('buildCreateDryRunMessage', () => {
  test('formats all four fields with consistent labels', () => {
    const msg = buildCreateDryRunMessage('Fix bug', 'diff --git', 'main', 'feature/fix');
    expect(msg).toBe(
      '[DRY RUN] Would create pull request:\n' +
        '- Title: Fix bug\n' +
        '- Body: diff --git\n' +
        '- Base: main\n' +
        '- Head: feature/fix'
    );
  });

  test('substitutes "(empty)" when bodyText is empty string', () => {
    const msg = buildCreateDryRunMessage('T', '', 'main', 'h');
    expect(msg).toContain('- Body: (empty)');
  });

  test('keeps falsy bodyText as-is unless strictly empty', () => {
    // The implementation uses `bodyText || '(empty)'` — a falsy non-empty
    // value would substitute. String '' is the only practical case, but
    // we pin the contract here.
    const msg = buildCreateDryRunMessage('T', '0', 'main', 'h');
    expect(msg).toContain('- Body: 0');
  });

  test('handles multiline bodyText (newlines preserved)', () => {
    const msg = buildCreateDryRunMessage('T', 'line1\nline2', 'main', 'h');
    expect(msg).toContain('- Body: line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// buildCreateDryRunResult
// ---------------------------------------------------------------------------

describe('buildCreateDryRunResult', () => {
  test('returns the canonical dry-run shape with zero PR number and empty URL', () => {
    const result = buildCreateDryRunResult('msg', 'feature/x', 'main');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'msg' }],
      details: {
        pullRequestNumber: 0,
        pullRequestUrl: '',
        headBranch: 'feature/x',
        baseBranch: 'main',
        dryRun: true,
      },
    });
  });

  test('content array always has exactly one entry', () => {
    const result = buildCreateDryRunResult('m', 'h', 'b');
    expect(result.content).toHaveLength(1);
  });

  test('content text matches the message argument exactly', () => {
    const result = buildCreateDryRunResult('hello\nworld', 'h', 'b');
    expect(result.content[0]!.text).toBe('hello\nworld');
  });

  test('dryRun is always true', () => {
    const result = buildCreateDryRunResult('m', 'h', 'b');
    expect(result.details.dryRun).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCreateSuccessMessage
// ---------------------------------------------------------------------------

describe('buildCreateSuccessMessage', () => {
  test('formats the canonical success message', () => {
    expect(
      buildCreateSuccessMessage({
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        headRef: 'feature/x',
        baseRef: 'main',
      })
    ).toBe('Pull request #42 created: https://github.com/owner/repo/pull/42');
  });

  test('handles PR #1', () => {
    expect(buildCreateSuccessMessage({ number: 1, url: 'u', headRef: 'h', baseRef: 'b' })).toBe(
      'Pull request #1 created: u'
    );
  });

  test('handles large PR numbers', () => {
    expect(
      buildCreateSuccessMessage({
        number: 999999,
        url: 'url',
        headRef: 'h',
        baseRef: 'b',
      })
    ).toBe('Pull request #999999 created: url');
  });
});

// ---------------------------------------------------------------------------
// buildCreateSuccessResult
// ---------------------------------------------------------------------------

describe('buildCreateSuccessResult', () => {
  const pr = {
    number: 7,
    url: 'https://gh/7',
    headRef: 'feature/y',
    baseRef: 'develop',
  };

  test('returns the canonical success shape with dryRun=false', () => {
    expect(buildCreateSuccessResult(pr)).toEqual({
      content: [{ type: 'text', text: 'Pull request #7 created: https://gh/7' }],
      details: {
        pullRequestNumber: 7,
        pullRequestUrl: 'https://gh/7',
        headBranch: 'feature/y',
        baseBranch: 'develop',
        dryRun: false,
      },
    });
  });

  test('content text matches buildCreateSuccessMessage', () => {
    const result = buildCreateSuccessResult(pr);
    expect(result.content[0]!.text).toBe(buildCreateSuccessMessage(pr));
  });

  test('maps headRef→headBranch and baseRef→baseBranch', () => {
    const result = buildCreateSuccessResult(pr);
    expect(result.details.headBranch).toBe('feature/y');
    expect(result.details.baseBranch).toBe('develop');
  });
});

// ---------------------------------------------------------------------------
// formatCreateError
// ---------------------------------------------------------------------------

describe('formatCreateError', () => {
  test('prefixes Error instances with the canonical tag', () => {
    expect(formatCreateError(new Error('boom'))).toBe(
      '[pull-request] Failed to create pull request: boom'
    );
  });

  test('preserves multi-line Error messages verbatim', () => {
    const err = new Error('line1\nline2');
    expect(formatCreateError(err)).toBe(
      '[pull-request] Failed to create pull request: line1\nline2'
    );
  });

  test('handles non-Error throwables (string)', () => {
    expect(formatCreateError('literally a string')).toBe(
      '[pull-request] Failed to create pull request: literally a string'
    );
  });

  test('handles non-Error throwables (number)', () => {
    expect(formatCreateError(42)).toBe('[pull-request] Failed to create pull request: 42');
  });

  test('handles null', () => {
    expect(formatCreateError(null)).toBe('[pull-request] Failed to create pull request: null');
  });

  test('handles undefined', () => {
    expect(formatCreateError(undefined)).toBe(
      '[pull-request] Failed to create pull request: undefined'
    );
  });

  test('handles plain objects (String coerces them to [object Object])', () => {
    expect(formatCreateError({ x: 1 })).toBe(
      '[pull-request] Failed to create pull request: [object Object]'
    );
  });

  test('handles subclass of Error (preserves .message)', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }
    expect(formatCreateError(new CustomError('specific failure'))).toBe(
      '[pull-request] Failed to create pull request: specific failure'
    );
  });
});
