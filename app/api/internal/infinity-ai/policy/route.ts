import { NextRequest, NextResponse } from 'next/server';

import { buildInfinityPolicyContext } from '@/lib/infinity-ai/policy';
import { aiActorContextSchema } from '@/lib/infinity-ai/schemas';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

export async function POST(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const conversationId = String(body.conversationId ?? '');
  const actor = aiActorContextSchema.parse(body.actor);

  try {
    const policy = await buildInfinityPolicyContext({
      conversationId,
      actor,
    });

    return NextResponse.json(policy);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build policy context' },
      { status: 400 }
    );
  }
}
