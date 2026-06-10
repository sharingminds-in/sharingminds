import { NextRequest, NextResponse } from 'next/server';

import { startAiGraphRun } from '@/lib/infinity-ai/repository';
import { aiGraphRunStartRequestSchema } from '@/lib/infinity-ai/schemas';
import { assertInfinityInternalRequest } from '@/lib/infinity-ai/server';

function isMissingGraphSchema(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('ai_graph_runs');
}

export async function POST(request: NextRequest) {
  try {
    assertInfinityInternalRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = aiGraphRunStartRequestSchema.parse(await request.json());

  try {
    const graphRun = await startAiGraphRun(body);
    return NextResponse.json(graphRun);
  } catch (error) {
    if (isMissingGraphSchema(error)) {
      return NextResponse.json(
        {
          code: 'INFINITY_AI_GRAPH_SCHEMA_MISSING',
          error:
            'Infinity AI graph storage is not ready. Apply lib/db/migrations/0057_infinity_ai_graph_runs.sql to the connected database.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start AI graph run' },
      { status: 400 }
    );
  }
}
