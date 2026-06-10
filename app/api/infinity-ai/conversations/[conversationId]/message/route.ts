import { NextRequest, NextResponse } from 'next/server';

import { sendInfinityAiMessage } from '@/lib/infinity-ai/client';
import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';
import { infinityConversationMessageInputSchema } from '@/lib/infinity-ai/schemas';
import { resolveInfinityActorFromRequest } from '@/lib/infinity-ai/policy';
import { buildRequestOrigin } from '@/lib/infinity-ai/server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const config = getInfinityAiServerConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Infinity AI is disabled' }, { status: 404 });
  }

  const { conversationId } = await context.params;
  const body = infinityConversationMessageInputSchema.parse(await request.json());
  const actor = await resolveInfinityActorFromRequest(request, {
    surface: 'landing_page',
    anonymousSessionId: body.anonymousSessionId,
  });

  if (!actor.authenticated && !config.anonymousEnabled) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const response = await sendInfinityAiMessage({
      conversationId,
      userMessage: body.message,
      actor,
      platformBaseUrl: buildRequestOrigin(request),
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Infinity AI request failed',
      },
      { status: 502 }
    );
  }
}
