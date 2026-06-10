import { z } from 'zod';

const infinityAiServerEnvSchema = z.object({
  INFINITY_AI_ENABLED: z.string().optional().default('false'),
  NEXT_PUBLIC_INFINITY_AI_ENABLED: z.string().optional().default('false'),
  INFINITY_AI_REQUIRE_LLM: z.string().optional().default('true'),
  INFINITY_AI_ANONYMOUS_ENABLED: z.string().optional().default('true'),
  INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED: z.string().optional().default('false'),
  INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED: z.string().optional().default('false'),
  INFINITY_AI_PGVECTOR_ENABLED: z.string().optional().default('false'),
  INFINITY_AI_ADMIN_BOOSTS_ENABLED: z.string().optional().default('true'),
  INFINITY_AI_SERVICE_URL: z.string().url().optional(),
  INFINITY_AI_INTERNAL_SECRET: z.string().min(1).optional(),
});

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return value === 'true';
}

export function getInfinityAiServerConfig() {
  const env = infinityAiServerEnvSchema.parse(process.env);

  return {
    enabled: parseBoolean(env.INFINITY_AI_ENABLED, false),
    publicEnabled: parseBoolean(env.NEXT_PUBLIC_INFINITY_AI_ENABLED, false),
    requireLlm: parseBoolean(env.INFINITY_AI_REQUIRE_LLM, true),
    anonymousEnabled: parseBoolean(env.INFINITY_AI_ANONYMOUS_ENABLED, true),
    anonymousExpertPreviewEnabled: parseBoolean(
      env.INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED,
      false
    ),
    crossChatMemoryEnabled: parseBoolean(env.INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED, false),
    pgvectorEnabled: parseBoolean(env.INFINITY_AI_PGVECTOR_ENABLED, false),
    adminBoostsEnabled: parseBoolean(env.INFINITY_AI_ADMIN_BOOSTS_ENABLED, true),
    serviceUrl: env.INFINITY_AI_SERVICE_URL ?? null,
    internalSecret: env.INFINITY_AI_INTERNAL_SECRET ?? null,
  };
}

export function getInfinityAiPublicEnabled() {
  return parseBoolean(process.env.NEXT_PUBLIC_INFINITY_AI_ENABLED, false);
}
