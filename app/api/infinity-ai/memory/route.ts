import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { listUserMemoryItems } from '@/lib/infinity-ai/repository';
import { aiUserMemoryResponseSchema } from '@/lib/infinity-ai/schemas';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const memories = await listUserMemoryItems(session.user.id);
  const response = aiUserMemoryResponseSchema.parse({ memories });

  return NextResponse.json(response);
}
