import { NextRequest, NextResponse } from 'next/server';

import { persistAiExchange } from '@/lib/infinity-ai/repository';
import type { AiPersistRequest } from '@/lib/infinity-ai/schemas';
import { aiPersistRequestSchema } from '@/lib/infinity-ai/schemas';
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

  let body: AiPersistRequest;
  try {
    body = aiPersistRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid persist request payload' },
      { status: 400 }
    );
  }

  try {
    const persisted = await persistAiExchange(body);
    return NextResponse.json(persisted);
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
      { error: error instanceof Error ? error.message : 'Failed to persist AI exchange' },
      { status: 400 }
    );
  }
}
