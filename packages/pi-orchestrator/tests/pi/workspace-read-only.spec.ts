/**
 * Behavior tests for the workspace-read-only Pi tool boundary.
 *
 * The tests invoke the real four tool implementations against a temporary
 * workspace. A model-controlled path must be canonicalized before the SDK
 * touches the filesystem; string-prefix checks and an allowlist alone are not
 * sufficient because symlinks and /proc are outside the review workspace.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildWorkspaceReadOnlyResourceLoaderOptions,
  createWorkspaceBoundaryTracker,
  createWorkspaceReadOnlyTools,
  validateWorkspaceRoot,
} from '../../src/pi/workspace-read-only';

interface ToolResult {
  content?: { text?: string }[];
}

interface Tool {
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

const BOUNDARY_VIOLATION_CODE = 'WORKSPACE_BOUNDARY_VIOLATION';

let workspaceRoot: string;
let outsideRoot: string;
let prefixCollisionRoot: string | undefined;

function toolsForWorkspace(): Tool[] {
  const tools = createWorkspaceReadOnlyTools(workspaceRoot) as unknown;
  return Array.isArray(tools) ? (tools as Tool[]) : Object.values(tools as Record<string, Tool>);
}

function toolNamed(name: string): Tool {
  const tool = toolsForWorkspace().find(candidate => candidate.name === name);
  if (!tool) {
    throw new Error(`workspace-read-only tool not found: ${name}`);
  }
  return tool;
}

async function executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
  return toolNamed(name).execute(`test-${name}`, params);
}

function contentText(result: ToolResult): string {
  return result.content?.map(item => item.text ?? '').join('') ?? '';
}

describe('workspace-read-only tools', () => {
  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-review-workspace-'));
    outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-review-outside-'));
    fs.mkdirSync(path.join(workspaceRoot, 'src', 'nested'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'src', 'nested', 'review.ts'),
      'export const reviewFinding = "important";\n'
    );
    fs.writeFileSync(path.join(outsideRoot, 'secret.txt'), 'runner secret\n');
    fs.mkdirSync(path.join(outsideRoot, 'secret-dir'));
    fs.writeFileSync(path.join(outsideRoot, 'secret-dir', 'nested.txt'), 'outside\n');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
    if (prefixCollisionRoot) {
      fs.rmSync(prefixCollisionRoot, { recursive: true, force: true });
      prefixCollisionRoot = undefined;
    }
  });

  test('exposes exactly read, grep, find, and ls', () => {
    expect(
      toolsForWorkspace()
        .map(tool => tool.name)
        .sort()
    ).toEqual(['find', 'grep', 'ls', 'read']);
  });

  test('read accepts both relative and absolute paths inside the workspace', async () => {
    const relative = await executeTool('read', { path: 'src/nested/review.ts' });
    const absolute = await executeTool('read', {
      path: path.join(workspaceRoot, 'src', 'nested', 'review.ts'),
    });

    expect(contentText(relative)).toContain('reviewFinding');
    expect(contentText(absolute)).toContain('reviewFinding');
  });

  test('ls accepts paths inside the workspace', async () => {
    const ls = await executeTool('ls', { path: 'src/nested' });

    expect(contentText(ls)).toContain('review.ts');
  });

  test.each(['read', 'grep', 'find', 'ls'])(
    '%s rejects parent traversal outside the workspace',
    async name => {
      const outsideFile = path.relative(workspaceRoot, path.join(outsideRoot, 'secret.txt'));
      const outsidePath = path.relative(workspaceRoot, outsideRoot);
      const params =
        name === 'read'
          ? { path: outsideFile }
          : name === 'grep'
            ? { pattern: 'secret', path: outsideFile }
            : { pattern: '*', path: outsidePath };
      const toolParams = name === 'ls' ? { path: outsidePath } : params;

      await expect(executeTool(name, toolParams)).rejects.toMatchObject({
        code: BOUNDARY_VIOLATION_CODE,
      });
    }
  );

  test.each([
    ['read', { path: '/proc/self/environ' }],
    ['grep', { pattern: 'OPENAI_API_KEY', path: '/proc/self' }],
    ['find', { pattern: '*', path: '/proc' }],
    ['ls', { path: '/proc' }],
  ])('%s rejects runner paths such as /proc', async (name, params) => {
    await expect(executeTool(name, params)).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });
  });

  test('rejects an outside path that merely shares the workspace string prefix', async () => {
    prefixCollisionRoot = `${workspaceRoot}-sibling`;
    const prefixCollision = path.join(prefixCollisionRoot, 'secret.txt');
    fs.mkdirSync(prefixCollisionRoot, { recursive: true });
    fs.writeFileSync(prefixCollision, 'prefix collision secret\n');

    await expect(executeTool('read', { path: prefixCollision })).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });
  });

  test('preserves the normal missing-file error for a missing path inside the workspace', async () => {
    const missingPath = 'src/nested/does-not-exist.ts';

    const error = await executeTool('read', { path: missingPath }).catch(reason => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toMatchObject({ code: BOUNDARY_VIOLATION_CODE });
    expect(error).toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a file symlink whose target escapes the workspace', async () => {
    const link = path.join(workspaceRoot, 'src', 'secret-link.txt');
    fs.symlinkSync(path.join(outsideRoot, 'secret.txt'), link, 'file');

    await expect(executeTool('read', { path: 'src/secret-link.txt' })).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });
  });

  test('rejects a directory symlink whose target escapes the workspace', async () => {
    const link = path.join(workspaceRoot, 'outside-dir');
    fs.symlinkSync(path.join(outsideRoot, 'secret-dir'), link, 'dir');

    await expect(executeTool('ls', { path: 'outside-dir' })).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });
  });

  test('records the tool and the refusal stage, and never the requested path', async () => {
    const tracker = createWorkspaceBoundaryTracker();
    const tools = createWorkspaceReadOnlyTools(workspaceRoot, tracker) as unknown as Tool[];
    const toolFor = (name: string): Tool => {
      const tool = tools.find(candidate => candidate.name === name);
      if (!tool) {
        throw new Error(`workspace-read-only tool not found: ${name}`);
      }
      return tool;
    };

    const escapingLink = path.join(workspaceRoot, 'escape-dir');
    fs.symlinkSync(path.join(outsideRoot, 'secret-dir'), escapingLink, 'dir');

    await expect(
      toolFor('read').execute('r1', { path: '/proc/self/environ' })
    ).rejects.toMatchObject({ code: BOUNDARY_VIOLATION_CODE });
    await expect(toolFor('ls').execute('l1', { path: 'escape-dir' })).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });

    // A refusal that resolved out through a link is a different signal from an
    // absolute path typed straight into the tool; triage needs to tell them apart.
    expect(tracker.records).toEqual([
      { tool: 'read', refusal: 'outside-workspace' },
      { tool: 'ls', refusal: 'escaping-symlink' },
    ]);
    expect(JSON.stringify(tracker.records)).not.toContain('proc');
    expect(JSON.stringify(tracker.records)).not.toContain(outsideRoot);
  });

  test('reset clears recorded refusals between runs', async () => {
    const tracker = createWorkspaceBoundaryTracker();
    const tools = createWorkspaceReadOnlyTools(workspaceRoot, tracker) as unknown as Tool[];
    const read = tools.find(candidate => candidate.name === 'read')!;

    await expect(read.execute('r1', { path: '/proc/self/environ' })).rejects.toMatchObject({
      code: BOUNDARY_VIOLATION_CODE,
    });
    expect(tracker.records).toHaveLength(1);

    tracker.reset();

    expect(tracker.records).toHaveLength(0);
    expect(tracker.violation).toBeUndefined();
  });

  test('makes a boundary violation observable for fail-closed callers', async () => {
    const error = await executeTool('read', { path: '/proc/self/environ' }).catch(reason => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: BOUNDARY_VIOLATION_CODE });
    expect(String(error.message)).toMatch(/workspace boundary/i);
  });
});

describe('workspace-read-only root validation', () => {
  let root: string;
  let mismatchedCwd: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-review-root-'));
    mismatchedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-review-cwd-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(mismatchedCwd, { recursive: true, force: true });
  });

  test('returns the canonical workspace when GITHUB_WORKSPACE matches action cwd', () => {
    expect(validateWorkspaceRoot(root, root)).toBe(fs.realpathSync(root));
  });

  test('rejects a missing GITHUB_WORKSPACE', () => {
    expect(() => validateWorkspaceRoot(undefined, root)).toThrow(/GITHUB_WORKSPACE.*set/i);
  });

  test('rejects an action cwd that differs from GITHUB_WORKSPACE', () => {
    expect(() => validateWorkspaceRoot(root, mismatchedCwd)).toThrow(
      /action working directory.*GITHUB_WORKSPACE/i
    );
  });
});

describe('workspace-read-only resource loader', () => {
  test('disables all executable and repository-controlled resource discovery', async () => {
    const options = await buildWorkspaceReadOnlyResourceLoaderOptions({
      cwd: '/tmp/review-workspace',
      systemPrompt: 'trusted review rubric',
    });

    expect(options).toMatchObject({
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      additionalExtensionPaths: [],
      additionalSkillPaths: [],
      additionalPromptTemplatePaths: [],
      additionalThemePaths: [],
    });
    expect(options.systemPrompt).toBe('trusted review rubric');
    expect(options.appendSystemPrompt).toEqual([]);
  });
});
