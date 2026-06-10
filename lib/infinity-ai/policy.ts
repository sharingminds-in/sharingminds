import { auth } from '@/lib/auth';
import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';
import type { AiActorContext, AiPolicyContext } from '@/lib/infinity-ai/schemas';
import { listRecentMemoryItems, listConversationTurns, getConversationForActor } from '@/lib/infinity-ai/repository';
import { enforceFeature, isSubscriptionPolicyError } from '@/lib/subscriptions/policy-runtime';

async function hasSessionBookingAccess(userId: string) {
  for (const action of [
    'booking.mentee.free_session',
    'booking.mentee.paid_session',
    'booking.mentee.counseling_session',
  ] as const) {
    try {
      const access = await enforceFeature({ action, userId }).catch((error) => {
        if (isSubscriptionPolicyError(error)) {
          return null;
        }

        throw error;
      });

      if (access?.has_access) {
        return true;
      }
    } catch (error) {
      console.error('[infinity-ai] failed to resolve booking access', error);
    }
  }

  return false;
}

export async function resolveInfinityActorFromRequest(
  request: Request,
  input: {
    surface: string;
    anonymousSessionId?: string | null;
  }
): Promise<AiActorContext> {
  const session = await auth.api.getSession({ headers: request.headers });

  return {
    userId: session?.user?.id ?? null,
    anonymousSessionId: input.anonymousSessionId ?? null,
    surface: input.surface,
    authenticated: Boolean(session?.user?.id),
  };
}

export async function buildInfinityPolicyContext(input: {
  conversationId: string;
  actor: AiActorContext;
}): Promise<AiPolicyContext> {
  const config = getInfinityAiServerConfig();
  const conversation = await getConversationForActor(input.conversationId, input.actor);

  if (!conversation) {
    throw new Error('Conversation not found for actor');
  }

  const turns = await listConversationTurns(input.conversationId, 14);
  const memoryItems =
    config.crossChatMemoryEnabled && input.actor.userId != null
      ? await listRecentMemoryItems(input.actor.userId, 8)
      : [];
  const canBookSessions =
    input.actor.userId != null ? await hasSessionBookingAccess(input.actor.userId) : false;
  const canPreviewExpertsAnonymously =
    !input.actor.authenticated &&
    config.anonymousEnabled &&
    config.anonymousExpertPreviewEnabled;
  const canRecommendExperts = canBookSessions || canPreviewExpertsAnonymously;

  return {
    conversation: {
      id: conversation.id,
      userId: conversation.userId ?? null,
      anonymousSessionId: conversation.anonymousSessionId ?? null,
      surface: conversation.surface,
      status: conversation.status,
      phase: conversation.phase as AiPolicyContext['conversation']['phase'],
      depthMode: conversation.depthMode as AiPolicyContext['conversation']['depthMode'],
      signalSnapshot: (conversation.signalSnapshot ?? {}) as Record<string, unknown>,
      memorySnapshot: (conversation.memorySnapshot ?? {}) as Record<string, unknown>,
      readinessSnapshot: (conversation.readinessSnapshot ?? null) as AiPolicyContext['conversation']['readinessSnapshot'],
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    turns,
    memoryItems,
    actor: input.actor,
    policy: {
      canBookSessions,
      canRecommendExperts,
      canRecommendResources: config.anonymousEnabled || input.actor.authenticated,
      resourceVisibility: 'public_only',
      allowAnonymous: config.anonymousEnabled,
      requiresAuthForBooking: !input.actor.authenticated,
      bookingSource: 'ai',
      maxExperts: 3,
      featureFlags: {
        enabled: config.enabled,
        requireLlm: config.requireLlm,
        anonymousEnabled: config.anonymousEnabled,
        anonymousExpertPreviewEnabled: config.anonymousExpertPreviewEnabled,
        crossChatMemoryEnabled: config.crossChatMemoryEnabled,
        pgvectorEnabled: config.pgvectorEnabled,
        adminBoostsEnabled: config.adminBoostsEnabled,
      },
    },
  };
}
