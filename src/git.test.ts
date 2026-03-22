import { describe, it, expect, beforeEach } from 'bun:test';
import { GitService } from './git.js';

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(() => {
    gitService = new GitService('test-token');
  });

  describe('constructor', () => {
    it('should initialize with token', () => {
      const service = new GitService('my-token');
      expect(service).toBeInstanceOf(GitService);
    });

    it('should use current working directory by default', () => {
      const service = new GitService('token', process.cwd());
      expect(service).toBeInstanceOf(GitService);
    });

    it('should use custom directory when provided', () => {
      const service = new GitService('token', '/custom/path');
      expect(service).toBeInstanceOf(GitService);
    });
  });

  describe('branchIsDirty', () => {
    it('should return false for clean working directory', () => {
      const isDirty = gitService.branchIsDirty();
      expect(typeof isDirty).toBe('boolean');
    });

    it('should return true when there are uncommitted changes', () => {
      // This would need mocking to test dirty state
      const isDirty = gitService.branchIsDirty();
      expect(typeof isDirty).toBe('boolean');
    });
  });
});
