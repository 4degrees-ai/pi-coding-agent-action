/**
 * Tests for the {@link wrapAgent} adapter helper.
 *
 * `wrapAgent` is shared by every frontend (GitHub Action, CLI) to project an
 * {@link Agent} instance onto the simplified {@link PiAgent} interface, so the
 * delegation wiring (and the `ready()`-then-`run()` convenience) is verified
 * here in isolation rather than duplicated across frontend adapter tests.
 */

import { describe, expect, test, mock } from 'bun:test';
import { wrapAgent, type Agent, type PiAgent } from '@alexanderfortin/pi-orchestrator';

/**
 * Minimal stub satisfying the subset of the {@link Agent} surface that
 * {@link wrapAgent} touches. Methods are spied via `mock()` so the tests can
 * assert delegation and call order without a real SDK session.
 */
function createStubAgent(
  overrides: Partial<{
    ready: Agent['ready'];
    run: Agent['run'];
    getSessionStats: Agent['getSessionStats'];
    exportSessionHtml: Agent['exportSessionHtml'];
    exportSessionJsonl: Agent['exportSessionJsonl'];
  }> = {}
): Agent {
  return {
    ready: overrides.ready ?? mock(async () => undefined as unknown as Agent),
    run:
      overrides.run ??
      mock(async () => ({ result: 'ok', sessionStats: undefined, error: undefined })),
    getSessionStats: overrides.getSessionStats ?? mock(() => undefined),
    exportSessionHtml: overrides.exportSessionHtml ?? mock(async () => '/tmp/out.html'),
    exportSessionJsonl: overrides.exportSessionJsonl ?? mock(async () => '/tmp/out.jsonl'),
  } as unknown as Agent;
}

describe('wrapAgent', () => {
  test('returns a PiAgent delegating each method to the underlying Agent', async () => {
    const ready = mock(async () => undefined as unknown as Agent);
    const run = mock(async () => ({
      result: 'hello back',
      sessionStats: undefined,
      error: undefined,
    }));
    const getSessionStats = mock(() => ({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cost: 0.0001,
      version: 'test',
    }));
    const exportSessionHtml = mock(async () => '/tmp/session.html');
    const exportSessionJsonl = mock(async () => '/tmp/session.jsonl');

    const agent = createStubAgent({
      ready,
      run,
      getSessionStats,
      exportSessionHtml,
      exportSessionJsonl,
    });

    const wrapped: PiAgent = wrapAgent(agent);

    expect(await wrapped.run('hi')).toEqual({
      result: 'hello back',
      sessionStats: undefined,
      error: undefined,
    });
    expect(wrapped.getSessionStats()).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cost: 0.0001,
      version: 'test',
    });
    expect(await wrapped.exportSessionHtml('/x')).toBe('/tmp/session.html');
    expect(await wrapped.exportSessionJsonl('/y')).toBe('/tmp/session.jsonl');

    expect(ready).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('hi');
    expect(getSessionStats).toHaveBeenCalledTimes(1);
    expect(exportSessionHtml).toHaveBeenCalledWith('/x');
    expect(exportSessionJsonl).toHaveBeenCalledWith('/y');
  });

  test('run() always calls ready() before run()', async () => {
    const callOrder: string[] = [];
    const agent = createStubAgent({
      ready: mock(async () => {
        callOrder.push('ready');
        return undefined as unknown as Agent;
      }),
      run: mock(async () => {
        callOrder.push('run');
        return { result: 'ok', sessionStats: undefined, error: undefined };
      }),
    });

    await wrapAgent(agent).run('anything');

    expect(callOrder).toEqual(['ready', 'run']);
  });

  test('getSessionStats() forwards undefined transparently', () => {
    const agent = createStubAgent({ getSessionStats: mock(() => undefined) });
    expect(wrapAgent(agent).getSessionStats()).toBeUndefined();
  });

  test('run() propagates rejection from the underlying Agent', async () => {
    const agent = createStubAgent({
      ready: mock(async () => undefined as unknown as Agent),
      run: mock(async () => {
        throw new Error('provider down');
      }),
    });

    await expect(wrapAgent(agent).run('x')).rejects.toThrow('provider down');
  });
});
