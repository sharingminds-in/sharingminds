import { NextRequest, NextResponse } from 'next/server';

import { getSessionWithRoles } from '@/lib/auth/server/session-with-roles';
import { getInfinityConversationTrace } from '@/lib/infinity-ai/repository';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

async function canReviewTrace(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
    return true;
  } catch {
    const session = await getSessionWithRoles(request.headers);
    return session.isAdmin;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  if (!(await canReviewTrace(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const trace = await getInfinityConversationTrace(conversationId);

  if (!trace) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json(trace);
}
