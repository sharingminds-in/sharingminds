import { NextRequest, NextResponse } from 'next/server';

import { buildInfinityPolicyContext } from '@/lib/infinity-ai/policy';
import { listInfinityResourceCandidates } from '@/lib/infinity-ai/resource-candidates';
import {
  aiResourceCandidatesRequestSchema,
  aiResourceCandidatesResponseSchema,
} from '@/lib/infinity-ai/schemas';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

export async function POST(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = aiResourceCandidatesRequestSchema.parse(await request.json());
  const policyContext = await buildInfinityPolicyContext({
    conversationId: body.conversationId,
    actor: body.actor,
  });

  if (!policyContext.policy.canRecommendResources) {
    return NextResponse.json(
      aiResourceCandidatesResponseSchema.parse({
        candidates: [],
        visibility: 'public',
        policyBlocked: true,
      })
    );
  }

  const payload = await listInfinityResourceCandidates({
    signalSnapshot: body.signalSnapshot,
    userMessage: body.userMessage,
  });

  return NextResponse.json(
    aiResourceCandidatesResponseSchema.parse({
      ...payload,
      policyBlocked: false,
    })
  );
}
