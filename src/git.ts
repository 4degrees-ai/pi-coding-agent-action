import * as core from '@actions/core';
import * as github from '@actions/github';
import { runCommand } from './utils.js';
import type { GitAuthor } from './types.js';

// ── GitService Class ─────────────────────────────────────────
/**
 * Simplified Git operations service using system git CLI.
 * Assumes the repository is already checked out by actions/checkout.
 */
export class GitService {
  private readonly dir: string;
  private readonly committer: GitAuthor;
  private readonly token: string;

  constructor(token: string, dir: string = process.cwd()) {
    this.token = token;
    this.dir = dir;
    this.committer = {
      name: 'pi-agent[bot]',
      email: 'pi-agent[bot]@users.noreply.github.com',
    };
    core.info('Git service initialized');
  }

  // ── Git Command Helper ─────────────────────────────────────
  private git(args: string[]): string {
    return runCommand(['git', '-C', this.dir, ...args]);
  }

  private gitQuiet(args: string[]): string | undefined {
    try {
      return runCommand(['git', '-C', this.dir, ...args]);
    } catch {
      return undefined;
    }
  }

  // ── Status Operations ─────────────────────────────────────
  /**
   * Checks if the working directory has uncommitted changes.
   */
  branchIsDirty(): boolean {
    const output = this.gitQuiet(['status', '--porcelain']);
    return output !== undefined && output.trim().length > 0;
  }

  // ── Checkout Operations ───────────────────────────────────
  /**
   * Creates and checks out a new branch from the current state.
   */
  checkoutBranch(branch: string): void {
    core.info(`Creating and checking out branch ${branch}`);
    this.git(['checkout', '-b', branch]);
    core.info(`Checked out ${branch}`);
  }

  // ── Commit and Push ───────────────────────────────────────
  /**
   * Stages all changes, commits, and pushes to origin.
   */
  async commitAndPush(
    summary: string,
    author: { name: string; email: string },
    branch: string
  ): Promise<void> {
    core.info('Staging all changes');
    this.git(['add', '-A']);

    core.info(`Committing: ${summary}`);
    this.git([
      '-c',
      `user.name="${author.name}"`,
      '-c',
      `user.email="${author.email}"`,
      '-c',
      `committer.name="${this.committer.name}"`,
      '-c',
      `committer.email="${this.committer.email}"`,
      'commit',
      '-m',
      summary,
    ]);

    // Push with embedded auth token
    const { owner, repo } = github.context.repo;
    const authUrl = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;

    core.info(`Pushing ${branch} to origin`);
    this.git(['push', authUrl, `HEAD:${branch}`]);
    core.info('Push complete');
  }
}
