import { NextRequest, NextResponse } from 'next/server';

import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';
import {
  aiConversationBootstrapSchema,
  createInfinityConversationInputSchema,
} from '@/lib/infinity-ai/schemas';
import { resolveInfinityActorFromRequest } from '@/lib/infinity-ai/policy';
import {
  createNewConversation,
  getConversationBootstrap,
  listConversationsForActor,
} from '@/lib/infinity-ai/repository';

export async function GET(request: NextRequest) {
  const config = getInfinityAiServerConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Infinity AI is disabled' }, { status: 404 });
  }

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

  try {
    const conversations = await listConversationsForActor(actor, surface);
    return NextResponse.json({ conversations });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list Infinity AI conversations',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const config = getInfinityAiServerConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Infinity AI is disabled' }, { status: 404 });
  }

  const body = createInfinityConversationInputSchema.parse(await request.json().catch(() => ({})));
  const actor = await resolveInfinityActorFromRequest(request, {
    surface: body.surface ?? 'landing_page',
    anonymousSessionId: body.anonymousSessionId,
  });

  if (!actor.authenticated && !config.anonymousEnabled) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const surface = body.surface ?? 'landing_page';
    if (body.forceNew) {
      const conversation = await createNewConversation(actor, surface);
      return NextResponse.json(aiConversationBootstrapSchema.parse({ conversation, turns: [] }));
    }

    const bootstrap = await getConversationBootstrap(actor, surface);
    return NextResponse.json(aiConversationBootstrapSchema.parse(bootstrap));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to initialize Infinity AI conversation',
      },
      { status: 500 }
    );
  }
}
