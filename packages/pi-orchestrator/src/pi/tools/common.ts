/**
 * @file Shared utilities for tool execution.
 *
 * Structure:
 *   - Pure render helpers (`formatThreadHeader`, `formatThreadTimestamps`,
 *     `formatThreadLabels`, `formatPRFields`, `formatThreadBody`,
 *     `formatThreadComments`, `formatReviewComments`) — each is a small
 *     function that pushes 0–N lines into an output array. All exported
 *     for direct unit testing.
 *   - `formatThreadAsText` — the entry point. Composes the helpers in
 *     the canonical section order.
 */

import { Temporal } from '@js-temporal/polyfill';
import type {
  IssueOrPRThread,
  ThreadComment,
  ReviewComment,
  ReviewInlineComment,
} from '../../platform';

// Re-export so existing callers can keep importing from one place.
export type { IssueOrPRThread, ThreadComment, ReviewComment };

// ---------------------------------------------------------------------------
// Render helpers (each returns a `string[]` to be concatenated)
// ---------------------------------------------------------------------------

/**
 * Build the top header (kind + number + title) and the always-present
 * state + author block.
 */
export function formatThreadHeader(thread: IssueOrPRThread): string[] {
  return [
    `${thread.is_pull_request ? 'Pull Request' : 'Issue'} #${thread.number}: ${thread.title}`,
    '',
    `State: ${thread.state.toUpperCase()}`,
    `Author: @${thread.author}${thread.author_type === 'bot' ? ' (bot)' : ''}`,
  ];
}

/**
 * Optional timestamp lines (created / updated / closed / merged). Only
 * emits a line when the corresponding timestamp is truthy.
 */
// fallow-ignore-next-line complexity
export function formatThreadTimestamps(thread: IssueOrPRThread): string[] {
  const lines: string[] = [];
  if (thread.created_at) {
    lines.push(`Created: ${Temporal.Instant.from(thread.created_at).toString()}`);
  }
  if (thread.updated_at) {
    lines.push(`Updated: ${Temporal.Instant.from(thread.updated_at).toString()}`);
  }
  if (thread.closed_at) {
    lines.push(`Closed: ${Temporal.Instant.from(thread.closed_at).toString()}`);
  }
  if (thread.merged_at) {
    lines.push(`Merged: ${Temporal.Instant.from(thread.merged_at).toString()}`);
  }
  return lines;
}

/**
 * Labels block, rendered as a comma-separated quoted list (or `[]` when
 * there are no labels).
 */
export function formatThreadLabels(thread: IssueOrPRThread): string[] {
  if (thread.labels.length === 0) {
    return [];
  }
  return [`Labels: ${thread.labels.map(l => `"${l}"`).join(', ')}`];
}

/**
 * PR-only fields (head/base branch, head SHA). Returns `[]` for issues.
 */
// fallow-ignore-next-line complexity
export function formatPRFields(thread: IssueOrPRThread): string[] {
  if (!thread.is_pull_request) {
    return [];
  }
  return [
    `Head Branch: ${thread.head_branch ?? 'unknown'}`,
    `Base Branch: ${thread.base_branch ?? 'unknown'}`,
    `Head SHA: ${thread.head_sha ?? 'unknown'}`,
  ];
}

/**
 * Description block: empty when there is no body, otherwise a labeled
 * block ending with a blank separator line.
 */
export function formatThreadBody(thread: IssueOrPRThread): string[] {
  if (!thread.body) {
    return [];
  }
  return ['', 'Description:', thread.body, ''];
}

/**
 * Render the top-level comments section, including a header line with
 * the total count and one numbered block per comment. Always renders the
 * header (even when there are no comments) to keep the structure stable.
 */
export function formatThreadComments(comments: ThreadComment[]): string[] {
  const lines: string[] = [`Comments (${comments.length}):`];
  comments.forEach((comment, i) => {
    const triggerMark = comment.is_triggering_comment ? ' [📍 triggering comment]' : '';
    lines.push(
      `  ${i + 1}. @${comment.author}${comment.author_type === 'bot' ? ' (bot)' : ''}${triggerMark}`,
      `     ${Temporal.Instant.from(comment.created_at).toString()}`,
      `     ${comment.body}`
    );
  });
  return lines;
}

/**
 * Render the inline review-comments section for PRs. Returns `[]` for
 * issues or for PRs with no review comments. The caller is responsible
 * for the surrounding blank separator.
 */
export function formatReviewComments(reviewComments: ReviewComment[] | undefined): string[] {
  if (!reviewComments || reviewComments.length === 0) {
    return [];
  }
  const lines: string[] = ['', `Review Comments (${reviewComments.length}):`];
  reviewComments.forEach((comment, i) => {
    const lineInfo = comment.line !== null ? ` L${comment.line}` : '';
    const sideInfo = comment.side === 'LEFT' ? ' [old]' : '';
    lines.push(
      `  ${i + 1}. **${comment.path}${lineInfo}${sideInfo}** (@${comment.author}${comment.author_type === 'bot' ? ' (bot)' : ''}):`,
      `     ${comment.body}`
    );
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Format an {@link IssueOrPRThread} into a human-readable text summary.
 *
 * @param thread - The thread data to format.
 * @returns A multi-line string representation of the thread.
 */
export function formatThreadAsText(thread: IssueOrPRThread): string {
  const lines: string[] = [
    ...formatThreadHeader(thread),
    ...formatThreadTimestamps(thread),
    ...formatThreadLabels(thread),
    ...formatPRFields(thread),
    '', // separator before body / comments
    ...formatThreadBody(thread),
    ...formatThreadComments(thread.comments),
    ...formatReviewComments(thread.is_pull_request ? thread.review_comments : undefined),
  ];

  return lines.join('\n');
}

// Keep the unused import warning suppressed when bundlers tree-shake this file.
export type { ReviewInlineComment };
