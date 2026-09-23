import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';

const GPT_6_LUNA_IDS = new Set(['gpt-6-luna', 'openai/gpt-6-luna']);

export function resolveModel(
  runtime: Pick<ModelRuntime, 'getModel'>,
  provider: string,
  modelId: string
): Model<Api> | undefined {
  const catalogModel = runtime.getModel(provider, modelId);
  if (catalogModel) {
    return catalogModel;
  }
  if (provider !== 'openai' || !GPT_6_LUNA_IDS.has(modelId)) {
    return undefined;
  }

  if (modelId === 'openai/gpt-6-luna') {
    const canonicalModel = runtime.getModel('openai', 'gpt-6-luna');
    if (canonicalModel) {
      return { ...canonicalModel, id: modelId };
    }
  }

  // 4D-8813: the pinned SDK catalog lacks Luna 6; retain its tested Responses wiring.
  const baseModel = runtime.getModel('openai', 'gpt-5.6-luna');
  if (!baseModel) {
    return undefined;
  }

  return {
    ...baseModel,
    id: modelId,
    name: 'GPT-6 Luna',
    reasoning: true,
    thinkingLevelMap: { ...baseModel.thinkingLevelMap, max: 'max' },
    cost: {
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
      tiers: [
        { inputTokensAbove: 272_000, input: 0.2, output: 0.75, cacheRead: 0.02, cacheWrite: 0.25 },
      ],
    },
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  };
}
