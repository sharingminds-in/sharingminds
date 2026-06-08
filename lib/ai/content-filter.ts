import { generateObject } from 'ai';
import { z } from 'zod';
import { getFilterModel } from './provider';

const FILTER_ENABLED = process.env.CONTENT_FILTER_ENABLED === 'true';

const filterSchema = z.object({
  relevant: z.boolean(),
  reply: z.string(),
});

const FILTER_SYSTEM_PROMPT = `
You are a strict gatekeeper for a mentorship platform called SharingMinds.

The platform is ONLY about:
- Career guidance and professional growth
- Mentor-mentee connections
- Study abroad and higher education
- Skill development and upskilling
- Startup and founder mentorship

Your job: decide if the user's message is relevant to these topics.

Rules:
- Greetings (hi, hello, how are you) are RELEVANT — let them through.
- Anything about weather, sports, politics, entertainment, coding help unrelated to career, or general knowledge is NOT RELEVANT.
- When not relevant, write a short, warm reply redirecting the user to ask about their career or learning goals. Keep it under 2 sentences.
- When relevant, leave the reply field empty.
`.trim();

export async function filterUserMessage(
  message: string,
): Promise<{ relevant: boolean; reply: string }> {
  if (!FILTER_ENABLED) {
    console.log('[content-filter] disabled — skipping');
    return { relevant: true, reply: '' };
  }

  console.log('[content-filter] checking message');

  try {
    const result = await generateObject({
      model: getFilterModel(),
      schema: filterSchema,
      system: FILTER_SYSTEM_PROMPT,
      prompt: `User message: "${message}"`,
    });

    const { relevant, reply } = result.object;
    if (relevant) {
      console.log('[content-filter] ✓ relevant — passing to Aria');
    } else {
      console.log('[content-filter] ✗ blocked — returning redirect reply');
    }

    return { relevant, reply };
  } catch (error) {
    console.error('[content-filter] filter model failed, allowing message through', error);
    return { relevant: true, reply: '' };
  }
}
