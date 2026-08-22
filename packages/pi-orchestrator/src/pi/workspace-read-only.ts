/**
 * The hardened filesystem boundary used by the workspace-read-only action
 * mode.
 *
 * Pi's normal filesystem tools accept absolute paths and do not provide a
 * sandbox.  This module keeps the useful read-only tools, but makes every
 * model-supplied path pass through the workspace boundary before the real Pi
 * implementation sees it.
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import {
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type {
  LoadExtensionsResult,
  ResourceLoader,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

export const WORKSPACE_BOUNDARY_VIOLATION_CODE = 'WORKSPACE_BOUNDARY_VIOLATION';
export const WORKSPACE_PATH_UNAVAILABLE_CODE = 'WORKSPACE_PATH_UNAVAILABLE';

export const WORKSPACE_READ_ONLY_TOOL_NAMES = ['read', 'grep', 'find', 'ls'] as const;

export type WorkspaceReadOnlyToolName = (typeof WORKSPACE_READ_ONLY_TOOL_NAMES)[number];

/** Error used to fail a run without exposing the rejected path in logs. */
export class WorkspaceBoundaryViolation extends Error {
  readonly code = WORKSPACE_BOUNDARY_VIOLATION_CODE;

  constructor() {
    super('workspace boundary violation: requested path is outside the review workspace');
    this.name = 'WorkspaceBoundaryViolation';
  }
}

/** Error used when a path inside the workspace cannot be canonicalized. */
export class WorkspacePathUnavailable extends Error {
  readonly code: string;

  constructor(code?: string) {
    super('workspace path unavailable: requested path could not be resolved');
    this.name = 'WorkspacePathUnavailable';
    this.code = code ?? WORKSPACE_PATH_UNAVAILABLE_CODE;
  }
}

const noopResourceAction = (..._args: unknown[]): void => undefined;
const noopResourceAsyncAction = async (..._args: unknown[]): Promise<void> => undefined;

/**
 * Resource loader for hardened sessions.
 *
 * This deliberately does not delegate to DefaultResourceLoader. Constructing
 * that loader performs package/resource discovery before its no-* options can
 * be applied, so even an apparently disabled configuration would still let
 * repository or global files influence startup. The hardened loader has no
 * filesystem-backed resource sources at all.
 */
export class WorkspaceReadOnlyResourceLoader implements ResourceLoader {
  private readonly extensionsResult: LoadExtensionsResult = {
    extensions: [],
    errors: [],
    runtime: {
      flagValues: new Map(),
      pendingProviderRegistrations: [],
      pendingNativeProviderRegistrations: [],
      assertActive: noopResourceAction,
      invalidate: noopResourceAction,
      trackEventBusSubscription: unsubscribe => unsubscribe,
      registerProvider: noopResourceAction,
      registerNativeProvider: noopResourceAction,
      unregisterProvider: noopResourceAction,
      sendMessage: noopResourceAction,
      sendUserMessage: noopResourceAction,
      appendEntry: noopResourceAction,
      setSessionName: noopResourceAction,
      getSessionName: () => undefined,
      setLabel: noopResourceAction,
      getActiveTools: () => [],
      getAllTools: () => [],
      setActiveTools: noopResourceAction,
      refreshTools: noopResourceAction,
      getCommands: () => [],
      setModel: async () => false,
      getThinkingLevel: () => 'off',
      setThinkingLevel: noopResourceAction,
    },
  };

  constructor(private readonly trustedSystemPrompt: string) {}

  getExtensions(): LoadExtensionsResult {
    return this.extensionsResult;
  }

  getSkills(): ReturnType<ResourceLoader['getSkills']> {
    return { skills: [], diagnostics: [] };
  }

  getPrompts(): ReturnType<ResourceLoader['getPrompts']> {
    return { prompts: [], diagnostics: [] };
  }

  getThemes(): ReturnType<ResourceLoader['getThemes']> {
    return { themes: [], diagnostics: [] };
  }

  getAgentsFiles(): ReturnType<ResourceLoader['getAgentsFiles']> {
    return { agentsFiles: [] };
  }

  getSystemPrompt(): string {
    return this.trustedSystemPrompt;
  }

  getSystemPromptSource(): ReturnType<ResourceLoader['getSystemPromptSource']> {
    return undefined;
  }

  getAppendSystemPrompt(): string[] {
    return [];
  }

  getAppendSystemPromptSources(): ReturnType<ResourceLoader['getAppendSystemPromptSources']> {
    return [];
  }

  extendResources(_paths: Parameters<ResourceLoader['extendResources']>[0]): void {
    noopResourceAction(_paths);
  }

  async reload(_options?: Parameters<ResourceLoader['reload']>[0]): Promise<void> {
    await noopResourceAsyncAction(_options);
  }
}

export function createWorkspaceReadOnlyResourceLoader(
  trustedSystemPrompt: string
): WorkspaceReadOnlyResourceLoader {
  return new WorkspaceReadOnlyResourceLoader(trustedSystemPrompt);
}

export interface WorkspaceReadOnlyPolicyOptions {
  extensions?: string[] | undefined;
  loadBuiltinExtensions?: boolean | undefined;
  loadedTools?: string[] | undefined;
  exportSessionHtml?: boolean | undefined;
  exportSessionJsonl?: boolean | undefined;
  shareSession?: boolean | undefined;
}

/** Validate the policy inputs required by workspace-read-only mode. */
export function validateWorkspaceReadOnlyPolicy(options: WorkspaceReadOnlyPolicyOptions): void {
  if (options.extensions?.length) {
    throw new Error('extensions cannot be used with isolation_mode workspace-read-only');
  }

  if (options.loadBuiltinExtensions !== false) {
    throw new Error(
      'load_builtin_extensions must be false with isolation_mode workspace-read-only'
    );
  }

  const expectedTools = new Set<string>(WORKSPACE_READ_ONLY_TOOL_NAMES);
  const requestedTools = options.loadedTools ? new Set(options.loadedTools) : undefined;
  const exactToolSet =
    requestedTools?.size === expectedTools.size &&
    [...expectedTools].every(toolName => requestedTools.has(toolName));
  if (!exactToolSet) {
    throw new Error(
      'loaded_tools must contain exactly read, grep, find, and ls with isolation_mode workspace-read-only'
    );
  }

  if (options.exportSessionHtml || options.exportSessionJsonl || options.shareSession) {
    throw new Error(
      'session exports and sharing are disabled with isolation_mode workspace-read-only'
    );
  }
}

/** Shared state between tool wrappers and the Agent run that owns them. */
export interface WorkspaceBoundaryTracker {
  violation: WorkspaceBoundaryViolation | undefined;
  recordViolation(): WorkspaceBoundaryViolation;
  reset(): void;
}

export function createWorkspaceBoundaryTracker(): WorkspaceBoundaryTracker {
  let violation: WorkspaceBoundaryViolation | undefined;
  return {
    get violation() {
      return violation;
    },
    recordViolation() {
      violation ??= new WorkspaceBoundaryViolation();
      return violation;
    },
    reset() {
      violation = undefined;
    },
  };
}

function isWithinWorkspace(workspaceRoot: string, candidate: string): boolean {
  const relative = path.relative(workspaceRoot, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/**
 * Resolve and validate the action's workspace root.
 *
 * The action must start in exactly the canonical GITHUB_WORKSPACE directory;
 * allowing a child directory would make repository files outside the review
 * root reachable through an absolute path.
 */
export function validateWorkspaceRoot(
  githubWorkspace: string | undefined,
  actionCwd: string
): string {
  if (!githubWorkspace) {
    throw new Error('workspace-read-only requires GITHUB_WORKSPACE to be set');
  }

  let workspaceRoot: string;
  let canonicalCwd: string;
  try {
    workspaceRoot = fs.realpathSync(githubWorkspace);
    canonicalCwd = fs.realpathSync(actionCwd);
  } catch {
    throw new Error('workspace-read-only could not resolve the review workspace');
  }

  if (workspaceRoot !== canonicalCwd) {
    throw new Error(
      'workspace-read-only requires the action working directory to be the canonical GITHUB_WORKSPACE'
    );
  }

  return workspaceRoot;
}

async function canonicalizeRequestedPath(
  workspaceRoot: string,
  requestedPath: string | undefined,
  tracker: WorkspaceBoundaryTracker
): Promise<string> {
  const rawPath = requestedPath === undefined || requestedPath === '' ? '.' : requestedPath;
  const lexicalPath = path.resolve(workspaceRoot, rawPath);

  // Reject obvious escapes before touching the filesystem. This also handles
  // paths that do not exist yet, where realpath() cannot canonicalize them.
  if (!isWithinWorkspace(workspaceRoot, lexicalPath)) {
    throw tracker.recordViolation();
  }

  let canonicalPath: string;
  try {
    canonicalPath = await fsPromises.realpath(lexicalPath);
  } catch (error) {
    // Never delegate a path whose canonical location is unknown. Preserve a
    // filesystem error code for callers that need to distinguish ENOENT, but
    // keep the message free of the requested path and other raw details.
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? /^[A-Z][A-Z0-9_]*$/.test(error.code)
          ? error.code
          : undefined
        : undefined;
    throw new WorkspacePathUnavailable(code);
  }

  if (!isWithinWorkspace(workspaceRoot, canonicalPath)) {
    throw tracker.recordViolation();
  }

  return canonicalPath;
}

type PathParams = Record<string, unknown> & { path?: unknown };

// The four SDK definitions use schemas from the SDK's private TypeBox
// dependency. Using the SDK's own generic type here avoids coupling the
// wrapper to the repository's separate TypeBox version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any, any, any>;
type AnyToolExecuteArgs = Parameters<AnyToolDefinition['execute']>;

function wrapToolWithWorkspaceBoundary(
  definition: AnyToolDefinition,
  workspaceRoot: string,
  tracker: WorkspaceBoundaryTracker
): AnyToolDefinition {
  return {
    ...definition,
    async execute(...args: AnyToolExecuteArgs) {
      const [toolCallId, params, signal, onUpdate, ctx] = args;
      const originalParams = params as PathParams;
      let requestedPath: string | undefined;
      if ('path' in originalParams) {
        if (typeof originalParams.path !== 'string') {
          throw new TypeError('workspace-read-only requires path to be a string when provided');
        }
        requestedPath = originalParams.path;
      }
      const canonicalPath = await canonicalizeRequestedPath(workspaceRoot, requestedPath, tracker);
      const safeParams: PathParams = { ...originalParams, path: canonicalPath };
      return definition.execute(toolCallId, safeParams, signal, onUpdate, ctx);
    },
  };
}

/**
 * Create exactly the four real Pi SDK read tools, with a path boundary added
 * in front of each implementation.
 */
export function createWorkspaceReadOnlyTools(
  workspaceRoot: string,
  tracker: WorkspaceBoundaryTracker = createWorkspaceBoundaryTracker()
): AnyToolDefinition[] {
  const canonicalRoot = fs.realpathSync(workspaceRoot);
  const definitions: AnyToolDefinition[] = [
    createReadToolDefinition(canonicalRoot),
    createGrepToolDefinition(canonicalRoot),
    createFindToolDefinition(canonicalRoot),
    createLsToolDefinition(canonicalRoot),
  ];

  return definitions.map(definition =>
    wrapToolWithWorkspaceBoundary(definition, canonicalRoot, tracker)
  );
}
