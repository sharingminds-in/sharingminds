import {
  aiServiceMessageRequestSchema,
  aiServiceMessageResponseSchema,
  type AiActorContext,
  type AiServiceMessageResponse,
} from '@/lib/infinity-ai/schemas';
import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';

function extractServiceErrorMessage(errorText: string) {
  if (!errorText) {
    return '';
  }

  try {
    const parsed = JSON.parse(errorText) as unknown;
    if (parsed && typeof parsed === 'object') {
      const detail = (parsed as { detail?: unknown }).detail;
      const error = (parsed as { error?: unknown }).error;
      const message = typeof detail === 'string' ? detail : typeof error === 'string' ? error : '';

      if (message) {
        try {
          const nested = JSON.parse(message) as unknown;
          if (nested && typeof nested === 'object') {
            const nestedError = (nested as { error?: unknown }).error;
            if (typeof nestedError === 'string' && nestedError.trim()) {
              return nestedError;
            }
          }
        } catch {
          return message;
        }

        return message;
      }
    }
  } catch {
    return errorText;
  }

  return errorText;
}

export async function sendInfinityAiMessage(input: {
  conversationId: string;
  userMessage: string;
  actor: AiActorContext;
  platformBaseUrl: string;
}): Promise<AiServiceMessageResponse> {
  const config = getInfinityAiServerConfig();

  if (!config.enabled || !config.serviceUrl || !config.internalSecret) {
    throw new Error('Infinity AI service is not configured');
  }

  const payload = aiServiceMessageRequestSchema.parse(input);
  const response = await fetch(
    `${config.serviceUrl.replace(/\/$/, '')}/v1/conversations/${input.conversationId}/message`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Infinity-AI-Internal-Secret': config.internalSecret,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(extractServiceErrorMessage(errorText));
  }

  return aiServiceMessageResponseSchema.parse(await response.json());
}

export const __infinityAiClientTest = {
  extractServiceErrorMessage,
};
