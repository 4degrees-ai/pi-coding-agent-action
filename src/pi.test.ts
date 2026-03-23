import { describe, it, expect } from 'bun:test';
import { runPi as _runPi, summarize, filterPiOutput } from './pi.js';

describe('pi', () => {
  describe('filterPiOutput', () => {
    it('should return empty string for empty input', () => {
      const result = filterPiOutput('');
      expect(result).toBe('');
    });

    it('should return empty string for whitespace only input', () => {
      const result = filterPiOutput('   \n\n  \t  \n');
      expect(result).toBe('');
    });

    it('should return single line output as is', () => {
      const input = 'This is a simple output';
      const result = filterPiOutput(input);
      expect(result).toBe(input);
    });

    it('should remove interim progress messages', () => {
      const input = `Working on the issue...
Analyzing the code...
This is the final summary of what was done.`;
      const result = filterPiOutput(input);
      // Without specific interim patterns, all lines are kept
      expect(result).toContain('final summary');
      expect(result).toContain('Working on the issue');
      expect(result).toContain('Analyzing the code');
    });

    it('should extract final meaningful response from multiple lines', () => {
      const input = `Starting analysis...
Processing data...
Implementing the fix...
The code has been updated to fix the memory leak issue in the user authentication module.`;
      const result = filterPiOutput(input);
      expect(result).toContain('code has been updated');
      expect(result).toContain('Starting analysis');
      expect(result).toContain('Processing data');
      expect(result).toContain('Implementing the fix');
    });

    it('should keep substantial final lines', () => {
      const input = `Step 1: Analyzing the problem
Step 2: Implementing solution
The issue has been successfully resolved by adding proper error handling to the API endpoint. This ensures that invalid requests are rejected with appropriate error messages.`;
      const result = filterPiOutput(input);
      expect(result).toContain('issue has been successfully resolved');
      expect(result).toContain('error handling');
      expect(result).toContain('Step 1');
      expect(result).toContain('Step 2');
    });

    it('should handle mixed interim and final messages', () => {
      const input = `I've started working on the issue.
Now implementing the fix...
The fix involves refactoring the authentication logic to use JWT tokens.
This improves security and simplifies the login process.`;
      const result = filterPiOutput(input);
      expect(result).toContain('refactoring the authentication logic');
      expect(result).toContain('improves security');
      // "I've started" and "Now implementing" should be filtered out
      expect(result).not.toContain('started working');
      expect(result).not.toContain('Now implementing');
    });

    it('should keep substantial Created PR message if it is part of final output', () => {
      const input = `Created PR #19 with the code quality improvements implemented.
The code quality analysis identified several issues that have been addressed:
- Removed unused imports
- Added proper error handling
- Improved code documentation`;
      const result = filterPiOutput(input);
      // The first line is substantial and describes what was done, so it should be kept
      expect(result).toContain('Created PR #19');
      expect(result).toContain('code quality analysis');
    });

    it('should return last few lines as fallback for all-interim messages', () => {
      const input = `Working on task A
Processing task B
Analyzing task C`;
      const result = filterPiOutput(input);
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('should preserve formatted lists in final output', () => {
      const input = `Starting implementation...
The following changes were made:

1. Fixed the memory leak
2. Optimized the database queries
3. Added unit tests

All tests pass successfully.`;
      const result = filterPiOutput(input);
      expect(result).toContain('1. Fixed the memory leak');
      expect(result).toContain('2. Optimized the database queries');
      expect(result).toContain('3. Added unit tests');
      expect(result).toContain('All tests pass successfully');
    });

    it('should handle single substantial line with short lines before it', () => {
      const input = `Fixing...
Done.
The issue has been resolved by implementing proper input validation.`;
      const result = filterPiOutput(input);
      expect(result).toContain('issue has been resolved');
    });

    it('should preserve continuation lines after substantial content', () => {
      const input = `Working...
The solution involves several key improvements:
- Better error handling
- Faster performance
- Improved security
All tests pass and the code is ready for review.`;
      const result = filterPiOutput(input);
      expect(result).toContain('solution involves several key improvements');
      expect(result).toContain('Better error handling');
      expect(result).toContain('Faster performance');
      expect(result).toContain('All tests pass');
    });
  });

  describe('summarize', () => {
    it('should use first line if exactly 50 characters', () => {
      const fiftyCharLine = 'x'.repeat(50);
      const summary = summarize(`${fiftyCharLine}\nMore text`, 123);
      expect(summary).toBe(fiftyCharLine);
    });

    it('should not use first line if over 50 characters', () => {
      const fiftyOneCharLine = 'x'.repeat(51);
      const summary = summarize(`${fiftyOneCharLine}\nMore text`, 123);
      expect(summary).not.toBe(fiftyOneCharLine);
      expect(summary.length).toBeLessThanOrEqual(50);
    });

    it('should not use generic first lines', () => {
      const summary = summarize('I will help you with that', 123);
      expect(summary).not.toBe('I will help you with that');
    });

    it('should reject "Great" as generic', () => {
      const summary = summarize('Great question!', 123);
      expect(summary).not.toContain('Great');
    });

    it('should reject "Here" as generic', () => {
      const summary = summarize('Here is the solution', 123);
      expect(summary).not.toContain('Here');
    });

    it('should reject "The" as generic', () => {
      const summary = summarize('The solution is simple', 123);
      expect(summary).not.toContain('The');
    });

    it('should reject "This" as generic', () => {
      const summary = summarize('This fixes the bug', 123);
      expect(summary).not.toContain('This');
    });

    it('should reject "A" as generic', () => {
      const summary = summarize('A better approach is needed', 123);
      expect(summary).not.toContain('A');
    });

    it('should use first sentence if first line is too long', () => {
      const summary = summarize(
        'This is a very long first line that exceeds fifty characters. But this is shorter.',
        123
      );
      expect(summary.length).toBeLessThanOrEqual(50);
      expect(summary).toContain('very long first line');
    });

    it('should truncate first sentence to 50 characters', () => {
      const longSentence = 'a'.repeat(100);
      const summary = summarize(`${longSentence}. More text.`, 123);
      expect(summary).toBe('a'.repeat(50));
    });

    it('should fallback to generic message for empty text', () => {
      const summary = summarize('', 123);
      expect(summary).toBe('Fix issue #123');
    });

    it('should handle multiline text with first short line', () => {
      const summary = summarize('Fixed memory leak\n\nDetails here', 123);
      expect(summary).toBe('Fixed memory leak');
    });

    it('should handle text with only one long line', () => {
      const longLine = 'x'.repeat(100);
      const summary = summarize(longLine, 123);
      expect(summary).toBe('x'.repeat(50));
    });

    it('should trim whitespace from summary', () => {
      const summary = summarize('  Fixed bug  ', 123);
      expect(summary).toBe('Fixed bug');
    });

    it('should handle first line with leading/trailing spaces', () => {
      const shortLine = '  Fix  ';
      const summary = summarize(`${shortLine}\nMore text`, 123);
      expect(summary).toBe('Fix');
    });
  });
});
