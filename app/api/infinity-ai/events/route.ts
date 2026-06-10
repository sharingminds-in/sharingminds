import { NextRequest, NextResponse } from 'next/server';

import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';
import { resolveInfinityActorFromRequest } from '@/lib/infinity-ai/policy';
import { getConversationForActor, recordRecommendationEvent } from '@/lib/infinity-ai/repository';
import { aiRecommendationEventInputSchema } from '@/lib/infinity-ai/schemas';

export async function POST(request: NextRequest) {
  const config = getInfinityAiServerConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Infinity AI is disabled' }, { status: 404 });
  }

  const body = aiRecommendationEventInputSchema.parse(await request.json());
  const anonymousSessionId =
    typeof body.metadata.anonymousSessionId === 'string'
      ? body.metadata.anonymousSessionId
      : undefined;
  const actor = await resolveInfinityActorFromRequest(request, {
    surface: 'landing_page',
    anonymousSessionId,
  });

  if (body.conversationId) {
    const conversation = await getConversationForActor(body.conversationId, actor);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
  }

  await recordRecommendationEvent({
    conversationId: body.conversationId ?? null,
    runId: body.runId ?? null,
    userId: actor.userId,
    mentorProfileId: body.mentorProfileId ?? null,
    mentorUserId: body.mentorUserId ?? null,
    candidateType: body.candidateType ?? null,
    entityId: body.entityId ?? null,
    resourceType: body.resourceType ?? null,
    resourceId: body.resourceId ?? null,
    eventType: body.eventType,
    idempotencyKey: body.idempotencyKey,
    metadata: body.metadata,
  });

  return NextResponse.json({ success: true });
}
