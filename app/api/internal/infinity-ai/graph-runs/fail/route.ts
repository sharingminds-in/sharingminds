import { NextRequest, NextResponse } from 'next/server';

import { markAiGraphRunFailed } from '@/lib/infinity-ai/repository';
import { aiGraphRunFailureRequestSchema } from '@/lib/infinity-ai/schemas';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

export async function POST(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = aiGraphRunFailureRequestSchema.parse(await request.json());

  try {
    const graphRun = await markAiGraphRunFailed(body);
    return NextResponse.json({ graphRun });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark AI graph run failed' },
      { status: 400 }
    );
  }
}
