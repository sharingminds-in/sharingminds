import { NextRequest, NextResponse } from 'next/server';

import { buildInfinityPolicyContext } from '@/lib/infinity-ai/policy';
import { listInfinityExpertCandidates } from '@/lib/infinity-ai/expert-candidates';
import {
  aiExpertCandidatesRequestSchema,
  aiExpertCandidatesResponseSchema,
} from '@/lib/infinity-ai/schemas';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

export async function POST(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = aiExpertCandidatesRequestSchema.parse(await request.json());
  const policyContext = await buildInfinityPolicyContext({
    conversationId: body.conversationId,
    actor: body.actor,
  });

  if (!policyContext.policy.canRecommendExperts) {
    return NextResponse.json(
      aiExpertCandidatesResponseSchema.parse({
        candidates: [],
        policyBlocked: true,
      })
    );
  }

  const payload = await listInfinityExpertCandidates({
    signalSnapshot: body.signalSnapshot,
  });

  return NextResponse.json(
    aiExpertCandidatesResponseSchema.parse({
      ...payload,
      policyBlocked: false,
    })
  );
}
