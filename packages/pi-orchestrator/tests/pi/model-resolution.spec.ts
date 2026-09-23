import { describe, expect, test, vi } from 'vitest';
import { clampThinkingLevel, getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import type { Api, Model } from '@earendil-works/pi-ai';
import { resolveModel } from '../../src/pi/model-resolution';

function makeModel(id: string, overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: true,
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
    contextWindow: 272_000,
    maxTokens: 128_000,
    ...overrides,
  } as Model<Api>;
}

function makeRuntime(...models: Model<Api>[]) {
  const getModel = vi.fn((provider: string, id: string) =>
    models.find(model => model.provider === provider && model.id === id)
  );
  return { runtime: { getModel } };
}

describe('resolveModel', () => {
  test('returns an exact catalog match unchanged', () => {
    const exact = makeModel('openai/gpt-6-luna');
    const { runtime } = makeRuntime(exact, makeModel('gpt-5.6-luna'));

    expect(resolveModel(runtime, 'openai', exact.id)).toBe(exact);
  });

  test('uses canonical Luna 6 catalog metadata for the OpenRouter alias', () => {
    const canonical = makeModel('gpt-6-luna', {
      cost: { input: 7, output: 8, cacheRead: 0.7, cacheWrite: 0.8 },
      contextWindow: 900_000,
      maxTokens: 64_000,
    });
    const { runtime } = makeRuntime(canonical, makeModel('gpt-5.6-luna'));

    expect(resolveModel(runtime, 'openai', 'openai/gpt-6-luna')).toMatchObject({
      id: 'openai/gpt-6-luna',
      cost: canonical.cost,
      contextWindow: 900_000,
      maxTokens: 64_000,
    });
  });

  test.each(['gpt-6-luna', 'openai/gpt-6-luna'])(
    'uses verified Luna 6 metadata and 5.6 Responses wiring for %s when the catalog is behind',
    id => {
      const base = makeModel('gpt-5.6-luna', {
        baseUrl: 'https://openrouter.ai/api/v1',
        cost: {
          input: 0.2,
          output: 1.2,
          cacheRead: 0.02,
          cacheWrite: 0.25,
          tiers: [
            {
              inputTokensAbove: 272_000,
              input: 0.4,
              output: 1.8,
              cacheRead: 0.04,
              cacheWrite: 0.5,
            },
          ],
        },
      });
      const { runtime } = makeRuntime(base);

      expect(resolveModel(runtime, 'openai', id)).toMatchObject({
        id,
        api: 'openai-responses',
        baseUrl: 'https://openrouter.ai/api/v1',
        reasoning: true,
        thinkingLevelMap: { max: 'max' },
        cost: {
          input: 0.1,
          output: 0.5,
          cacheRead: 0.01,
          cacheWrite: 0.125,
          tiers: [
            {
              inputTokensAbove: 272_000,
              input: 0.2,
              output: 0.75,
              cacheRead: 0.02,
              cacheWrite: 0.25,
            },
          ],
        },
        contextWindow: 1_050_000,
        maxTokens: 128_000,
      });
    }
  );

  test('marks minimal unsupported and clamps it when the compatibility model has no level map', () => {
    const { runtime } = makeRuntime(makeModel('gpt-5.6-luna'));
    const model = resolveModel(runtime, 'openai', 'gpt-6-luna');

    expect(model?.thinkingLevelMap?.minimal).toBeNull();
    expect(getSupportedThinkingLevels(model!)).not.toContain('minimal');
    expect(clampThinkingLevel(model!, 'minimal')).toBe('low');
  });

  test('keeps unrelated and unsupported provider/model lookups unresolved', () => {
    const { runtime } = makeRuntime(makeModel('gpt-5.6-luna'));

    expect(resolveModel(runtime, 'openrouter', 'openai/gpt-6-luna')).toBeUndefined();
    expect(resolveModel(runtime, 'openai', 'gpt-6-astra')).toBeUndefined();
    expect(resolveModel(makeRuntime().runtime, 'openai', 'gpt-6-luna')).toBeUndefined();
  });
});
