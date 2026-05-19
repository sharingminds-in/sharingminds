import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

type AiProvider = 'google' | 'openrouter';

const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'google') as AiProvider;

// Same Gemini 2.5 Flash model during Phase 0/1 — OpenRouter uses its own model ID format
const MODEL_IDS: Record<AiProvider, string> = {
  google: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash',
};

export function getAriaModel() {
  if (AI_PROVIDER === 'openrouter') {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) throw new Error('Server is missing OPEN_ROUTER_API_KEY');
    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    });
    return openrouter.chat(MODEL_IDS.openrouter);
  }
  return google(MODEL_IDS.google);
}

export function getProviderKeyError(): string | null {
  if (AI_PROVIDER === 'openrouter') {
    return process.env.OPEN_ROUTER_API_KEY ? null : 'Server is missing OPEN_ROUTER_API_KEY';
  }
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ? null : 'Server is missing GOOGLE_GENERATIVE_AI_API_KEY';
}
