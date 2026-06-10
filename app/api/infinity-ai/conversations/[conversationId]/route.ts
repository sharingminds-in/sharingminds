import { NextRequest, NextResponse } from 'next/server';

import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';
import { resolveInfinityActorFromRequest } from '@/lib/infinity-ai/policy';
import {
  getConversationForActor,
  listConversationTurns,
} from '@/lib/infinity-ai/repository';
import { aiConversationBootstrapSchema } from '@/lib/infinity-ai/schemas';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const config = getInfinityAiServerConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Infinity AI is disabled' }, { status: 404 });
  }

  const { conversationId } = await context.params;
  const { searchParams } = new URL(request.url);
  const surface = searchParams.get('surface') || 'landing_page';
  const anonymousSessionId = searchParams.get('anonymousSessionId');
  const actor = await resolveInfinityActorFromRequest(request, {
    surface,
    anonymousSessionId,
  });

  if (!actor.authenticated && !config.anonymousEnabled) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const conversation = await getConversationForActor(conversationId, actor);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const turns = await listConversationTurns(conversationId, 100);
  return NextResponse.json(
    aiConversationBootstrapSchema.parse({
      conversation: {
        id: conversation.id,
        userId: conversation.userId ?? null,
        anonymousSessionId: conversation.anonymousSessionId ?? null,
        surface: conversation.surface,
        status: conversation.status,
        phase: conversation.phase,
        depthMode: conversation.depthMode,
        signalSnapshot: conversation.signalSnapshot ?? {},
        memorySnapshot: conversation.memorySnapshot ?? {},
        readinessSnapshot: conversation.readinessSnapshot ?? null,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      turns,
    })
  );
}
