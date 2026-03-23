// ── GitHub Types ───────────────────────────────────────────────────
export interface IssueComment {
  databaseId: number;
  body: string;
  author: { login: string };
  createdAt: string;
}

export interface IssueNode {
  title: string;
  body: string;
  state: string;
  author: { login: string };
  createdAt: string;
  comments?: IssueComment[];
}

export interface PRFileChange {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
}

export interface PRReviewComment {
  path?: string;
  line?: number;
  body: string;
}

export interface PRReview {
  author: { login: string };
  body: string;
  submittedAt: string;
  comments?: PRReviewComment[];
}

export interface PRNode {
  title: string;
  body: string;
  state: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  // headRefOid is included by the GitHub CLI but not currently used
  headRefOid?: string;
  createdAt: string;
  additions: number;
  deletions: number;
  baseRepository: { nameWithOwner: string };
  headRepository: { nameWithOwner: string };
  commits: { totalCount: number };
  files?: PRFileChange[];
  comments?: IssueComment[];
  reviews?: PRReview[];
}

// ── Git Types ─────────────────────────────────────────────────────
export interface GitAuthor {
  name: string;
  email: string;
}
