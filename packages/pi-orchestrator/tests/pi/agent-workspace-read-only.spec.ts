/**
 * Integration coverage for hardened Agent startup.
 *
 * These tests deliberately create hostile repository and global resource
 * fixtures, then build a real AgentSession through Agent.ready(). The
 * assertions inspect the SDK session and execute the real registered wrapper;
 * no mock session or mock tool registry can make startup look safer than it is.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
} from '@earendil-works/pi-ai';
import { DefaultResourceLoader, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createMockProvider } from '../helpers/tool-mocks';
import {
  WORKSPACE_BOUNDARY_VIOLATION_CODE,
  WorkspaceReadOnlyResourceLoader,
} from '../../src/pi/workspace-read-only';

const { Agent } = await import('@alexanderfortin/pi-orchestrator');

const TOOL_NAMES = ['find', 'grep', 'ls', 'read'];
const HOSTILE_MARKER = 'HOSTILE_RESOURCE_MUST_NOT_BE_LOADED';

const noop = (): void => {};
const core = {
  getInput: vi.fn(() => ''),
  setFailed: vi.fn(noop),
  setOutput: vi.fn(noop),
  notice: vi.fn(noop),
  debug: vi.fn(noop),
  info: vi.fn(noop),
  warning: vi.fn(noop),
  error: vi.fn(noop),
};

let workspaceRoot: string;
let globalAgentRoot: string;
let originalWorkspace: string | undefined;
let originalAgentDir: string | undefined;

function hardenedConfig() {
  return {
    cwd: workspaceRoot,
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    token: '',
    thinkingLevel: 'off' as const,
    promptInput: '',
    isolationMode: 'workspace-read-only' as const,
    loadBuiltinExtensions: false,
    loadedTools: ['read', 'grep', 'find', 'ls'],
    exportSessionHtml: false,
    exportSessionJsonl: false,
    shareSession: false,
  };
}

function sessionOf(agent: InstanceType<typeof Agent>): any {
  return (agent as unknown as { session: unknown }).session;
}

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-hardened-workspace-'));
  globalAgentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-hardened-global-'));
  originalWorkspace = process.env.GITHUB_WORKSPACE;
  originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.GITHUB_WORKSPACE = workspaceRoot;
  process.env.PI_CODING_AGENT_DIR = globalAgentRoot;

  // Every source below would be model-visible or executable if the normal
  // resource loader performed project/global discovery during hardened startup.
  fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), HOSTILE_MARKER);
  fs.mkdirSync(path.join(workspaceRoot, '.pi', 'extensions'), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, '.pi', 'extensions', 'hostile.ts'),
    `throw new Error(${JSON.stringify(HOSTILE_MARKER)});\n`
  );
  fs.mkdirSync(path.join(workspaceRoot, '.pi', 'skills', 'hostile'), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, '.pi', 'skills', 'hostile', 'SKILL.md'),
    HOSTILE_MARKER
  );
  fs.mkdirSync(path.join(workspaceRoot, '.pi', 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.pi', 'prompts', 'hostile.md'), HOSTILE_MARKER);
  fs.mkdirSync(path.join(workspaceRoot, '.pi', 'themes'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.pi', 'themes', 'hostile.json'), HOSTILE_MARKER);

  fs.writeFileSync(path.join(globalAgentRoot, 'AGENTS.md'), HOSTILE_MARKER);
  fs.mkdirSync(path.join(globalAgentRoot, 'extensions'), { recursive: true });
  fs.writeFileSync(
    path.join(globalAgentRoot, 'extensions', 'hostile.ts'),
    `throw new Error(${JSON.stringify(HOSTILE_MARKER)});\n`
  );
  fs.mkdirSync(path.join(globalAgentRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(globalAgentRoot, 'skills', 'hostile.md'), HOSTILE_MARKER);
  fs.mkdirSync(path.join(globalAgentRoot, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(globalAgentRoot, 'prompts', 'hostile.md'), HOSTILE_MARKER);
  fs.mkdirSync(path.join(globalAgentRoot, 'themes'), { recursive: true });
  fs.writeFileSync(path.join(globalAgentRoot, 'themes', 'hostile.json'), HOSTILE_MARKER);
});

afterEach(() => {
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE;
  } else {
    process.env.GITHUB_WORKSPACE = originalWorkspace;
  }
  if (originalAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  }
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.rmSync(globalAgentRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('workspace-read-only Agent startup', () => {
  test('uses a trusted-only loader and exposes exactly the four read tools', async () => {
    const agent = new Agent(core as any, createMockProvider(), hardenedConfig());
    await agent.ready();

    const session = sessionOf(agent);
    expect(session.resourceLoader).toBeInstanceOf(WorkspaceReadOnlyResourceLoader);
    expect(
      session
        .getAllTools()
        .map((tool: { name: string }) => tool.name)
        .sort()
    ).toEqual(TOOL_NAMES);
    expect(session.getActiveToolNames().sort()).toEqual(TOOL_NAMES);
    expect(session.resourceLoader.getExtensions().extensions).toEqual([]);
    expect(session.resourceLoader.getExtensions().errors).toEqual([]);
    expect(session.resourceLoader.getSkills().skills).toEqual([]);
    expect(session.resourceLoader.getPrompts().prompts).toEqual([]);
    expect(session.resourceLoader.getThemes().themes).toEqual([]);
    expect(session.resourceLoader.getAgentsFiles().agentsFiles).toEqual([]);
    expect(session.systemPrompt).not.toContain(HOSTILE_MARKER);
    expect(session.resourceLoader.getSystemPrompt()).not.toContain(HOSTILE_MARKER);

    agent.dispose();
  });

  test('does not construct or reload the SDK DefaultResourceLoader', async () => {
    const reload = vi
      .spyOn(DefaultResourceLoader.prototype, 'reload')
      .mockRejectedValue(new Error(HOSTILE_MARKER));
    const agent = new Agent(core as any, createMockProvider(), hardenedConfig());

    await expect(agent.ready()).resolves.toBe(agent);
    expect(reload).not.toHaveBeenCalled();

    agent.dispose();
  });

  test('fails closed when a real session wrapper receives an outside path', async () => {
    const agent = new Agent(core as any, createMockProvider(), hardenedConfig());
    await agent.ready();

    const read = sessionOf(agent).getToolDefinition('read');
    expect(read).toBeDefined();
    const execute = read!.execute as unknown as (
      toolCallId: string,
      params: Record<string, unknown>
    ) => Promise<unknown>;

    await expect(execute('boundary-test', { path: '/proc/self/environ' })).rejects.toMatchObject({
      code: WORKSPACE_BOUNDARY_VIOLATION_CODE,
    });

    agent.dispose();
  });

  test('Agent.run rejects after the SDK converts a boundary throw into a tool result', async () => {
    const requests: Context[] = [];
    const stream = vi
      .spyOn(ModelRuntime.prototype, 'streamSimple')
      .mockImplementation((_model, context) => {
        requests.push(context);
        const response = createAssistantMessageEventStream();
        const message: AssistantMessage = {
          role: 'assistant',
          api: 'anthropic-messages',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          content:
            requests.length === 1
              ? [
                  {
                    type: 'toolCall',
                    id: 'boundary-tool-call',
                    name: 'read',
                    arguments: { path: '/proc/self/environ' },
                  },
                ]
              : [{ type: 'text', text: 'The read was blocked.' }],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: requests.length === 1 ? 'toolUse' : 'stop',
          timestamp: Date.now(),
        };
        response.push({
          type: 'done',
          reason: requests.length === 1 ? 'toolUse' : 'stop',
          message,
        });
        return response;
      });

    const agent = new Agent(core as any, createMockProvider(), {
      ...hardenedConfig(),
      token: 'test-token',
    });
    await agent.ready();

    try {
      await expect(agent.run('Read /proc/self/environ')).rejects.toMatchObject({
        code: WORKSPACE_BOUNDARY_VIOLATION_CODE,
      });
    } finally {
      agent.dispose();
    }

    expect(stream).toHaveBeenCalledTimes(2);
    expect(requests[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'toolResult',
          toolCallId: 'boundary-tool-call',
          toolName: 'read',
          isError: true,
        }),
      ])
    );
  });
});
