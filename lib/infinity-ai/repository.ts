import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import {
  aiConversations,
  aiGraphRuns,
  aiMemoryItems,
  aiRecommendationCandidates,
  aiRecommendationEvents,
  aiRecommendationRuns,
  aiTurns,
  aiUserSignals,
  sessions,
} from '@/lib/db/schema';
import type {
  AiActorContext,
  AiConversationSummary,
  AiConversationTurn,
  AiGraphRun,
  AiGraphRunFailureRequest,
  AiGraphRunStartRequest,
  AiGraphRunStartResponse,
  AiMemoryItem,
  AiPersistRequest,
  AiPersistResponse,
  AiUserMemoryItem,
} from '@/lib/infinity-ai/schemas';
import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function completePendingPersistTrace(traceMetadata: Record<string, unknown>) {
  const pending = traceMetadata.pendingPersistNodeTrace;
  const rest = { ...traceMetadata };
  delete rest.pendingPersistNodeTrace;

  if (!pending || typeof pending !== 'object') {
    return rest;
  }

  const pendingTrace = pending as Record<string, unknown>;
  const startedAt =
    typeof pendingTrace.startedAt === 'string' ? pendingTrace.startedAt : new Date().toISOString();
  const completedAt = new Date().toISOString();
  const startedMs = Date.parse(startedAt);
  const completedMs = Date.parse(completedAt);
  const latencyMs = Number.isFinite(startedMs)
    ? Math.max(0, completedMs - startedMs)
    : pendingTrace.latencyMs;
  const existingNodeTraces = Array.isArray(rest.nodeTraces)
    ? (rest.nodeTraces as Record<string, unknown>[])
    : [];

  return {
    ...rest,
    nodeTraces: [
      ...existingNodeTraces,
      {
        ...pendingTrace,
        completedAt,
        latencyMs,
        status: 'completed',
      },
    ],
  };
}

function toConversationSummary(
  row: typeof aiConversations.$inferSelect
): AiConversationSummary {
  return {
    id: row.id,
    userId: row.userId ?? null,
    anonymousSessionId: row.anonymousSessionId ?? null,
    surface: row.surface,
    status: row.status,
    phase: row.phase as AiConversationSummary['phase'],
    depthMode: row.depthMode as AiConversationSummary['depthMode'],
    signalSnapshot: (row.signalSnapshot ?? {}) as Record<string, unknown>,
    memorySnapshot: (row.memorySnapshot ?? {}) as Record<string, unknown>,
    readinessSnapshot: (row.readinessSnapshot ?? null) as AiConversationSummary['readinessSnapshot'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as AiConversationSummary;
}

function toConversationTurn(row: typeof aiTurns.$inferSelect): AiConversationTurn {
  return {
    id: row.id,
    actor: row.actor,
    inputText: row.inputText ?? null,
    responseBlocks: (row.responseBlocks ?? null) as AiConversationTurn['responseBlocks'],
    traceMetadata: (row.traceMetadata ?? null) as AiConversationTurn['traceMetadata'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toGraphRun(row: typeof aiGraphRuns.$inferSelect): AiGraphRun {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userTurnId: row.userTurnId ?? null,
    assistantTurnId: row.assistantTurnId ?? null,
    graphVersion: row.graphVersion,
    status: row.status as AiGraphRun['status'],
    phaseBefore: row.phaseBefore ?? null,
    phaseAfter: row.phaseAfter ?? null,
    stateBefore: (row.stateBefore ?? {}) as Record<string, unknown>,
    stateAfter: (row.stateAfter ?? {}) as Record<string, unknown>,
    nodeTraces: (row.nodeTraces ?? []) as Record<string, unknown>[],
    modelCalls: (row.modelCalls ?? []) as Record<string, unknown>[],
    selectedExpertIds: (row.selectedExpertIds ?? []) as string[],
    recommendationRunId: row.recommendationRunId ?? null,
    error: (row.error ?? null) as Record<string, unknown> | null,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIsoString(row.completedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toMemoryItem(row: typeof aiMemoryItems.$inferSelect): AiMemoryItem {
  return {
    id: row.id,
    memoryType: row.memoryType,
    content: row.content,
    confidence: Number(row.confidence),
    provenance: (row.provenance ?? {}) as Record<string, unknown>,
  };
}

function summarizeMemoryProvenance(
  provenance: Record<string, unknown>,
  conversationId: string | null
) {
  const source = typeof provenance.source === 'string' ? provenance.source : null;
  const phase = typeof provenance.phase === 'string' ? provenance.phase : null;
  const parts = [
    source ? `Source: ${source}` : null,
    phase ? `Phase: ${phase}` : null,
    conversationId ? `Conversation: ${conversationId}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function toUserMemoryItem(row: typeof aiMemoryItems.$inferSelect): AiUserMemoryItem {
  const provenance = (row.provenance ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    memoryType: row.memoryType,
    content: row.content,
    confidence: Number(row.confidence),
    provenanceSummary: summarizeMemoryProvenance(provenance, row.conversationId ?? null),
    conversationId: row.conversationId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getConversationForActor(
  conversationId: string,
  actor: AiActorContext
) {
  const ownerCondition =
    actor.userId != null
      ? actor.anonymousSessionId
        ? or(
            eq(aiConversations.userId, actor.userId),
            eq(aiConversations.anonymousSessionId, actor.anonymousSessionId)
          )
        : eq(aiConversations.userId, actor.userId)
      : eq(aiConversations.anonymousSessionId, actor.anonymousSessionId ?? '');

  const conditions = and(eq(aiConversations.id, conversationId), ownerCondition);

  const rows = await db
    .select()
    .from(aiConversations)
    .where(conditions)
    .limit(1);

  return rows[0] ?? null;
}

async function claimAnonymousConversationForUser(
  actor: AiActorContext,
  surface: string
) {
  if (!actor.userId || !actor.anonymousSessionId) {
    return null;
  }

  const latestAnonymousConversation = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.anonymousSessionId, actor.anonymousSessionId),
        eq(aiConversations.surface, surface),
        eq(aiConversations.status, 'active'),
        isNull(aiConversations.userId)
      )
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(1);

  await db
    .update(aiConversations)
    .set({
      userId: actor.userId,
    })
    .where(
      and(
        eq(aiConversations.anonymousSessionId, actor.anonymousSessionId),
        eq(aiConversations.surface, surface),
        eq(aiConversations.status, 'active'),
        isNull(aiConversations.userId)
      )
    );

  const latestAnonymous = latestAnonymousConversation[0];
  if (latestAnonymous) {
    const [claimed] = await db
      .update(aiConversations)
      .set({
        userId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, latestAnonymous.id))
      .returning();

    return claimed ?? latestAnonymous;
  }

  const existingUserConversation = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.userId, actor.userId),
        eq(aiConversations.surface, surface),
        eq(aiConversations.status, 'active')
      )
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(1);

  return existingUserConversation[0] ?? null;
}

export async function listConversationTurns(conversationId: string, limit = 12) {
  const rows = await db
    .select()
    .from(aiTurns)
    .where(eq(aiTurns.conversationId, conversationId))
    .orderBy(desc(aiTurns.createdAt))
    .limit(limit);

  return rows.reverse().map(toConversationTurn);
}

export async function listConversationsForActor(
  actor: AiActorContext,
  surface: string,
  limit = 24
) {
  await claimAnonymousConversationForUser(actor, surface);

  const rows = await db
    .select()
    .from(aiConversations)
    .where(
      actor.userId != null
        ? and(
            eq(aiConversations.userId, actor.userId),
            eq(aiConversations.surface, surface)
          )
        : and(
            eq(aiConversations.anonymousSessionId, actor.anonymousSessionId ?? ''),
            eq(aiConversations.surface, surface)
          )
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(limit);

  return rows.map(toConversationSummary);
}

export async function listRecentMemoryItems(userId: string, limit = 8) {
  const rows = await db
    .select()
    .from(aiMemoryItems)
    .where(eq(aiMemoryItems.userId, userId))
    .orderBy(desc(aiMemoryItems.updatedAt))
    .limit(limit);

  return rows.map(toMemoryItem);
}

export async function listUserMemoryItems(userId: string, limit = 100) {
  const rows = await db
    .select()
    .from(aiMemoryItems)
    .where(eq(aiMemoryItems.userId, userId))
    .orderBy(desc(aiMemoryItems.updatedAt))
    .limit(limit);

  return rows.map(toUserMemoryItem);
}

export async function deleteUserMemoryItem(userId: string, memoryId: string) {
  const deletedRows = await db
    .delete(aiMemoryItems)
    .where(and(eq(aiMemoryItems.id, memoryId), eq(aiMemoryItems.userId, userId)))
    .returning({ id: aiMemoryItems.id });

  return deletedRows.length > 0;
}

export async function syncSessionNoteMemories(userId: string) {
  if (!getInfinityAiServerConfig().crossChatMemoryEnabled) {
    return;
  }

  const recentSessions = await db
    .select({
      id: sessions.id,
      mentorId: sessions.mentorId,
      menteeId: sessions.menteeId,
      mentorNotes: sessions.mentorNotes,
      menteeNotes: sessions.menteeNotes,
      updatedAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.status, 'completed'),
        or(eq(sessions.mentorId, userId), eq(sessions.menteeId, userId))
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(10);

  const existingSessionIds = await db
    .select({
      sessionId: sql<string>`coalesce(${aiMemoryItems.provenance}->>'sessionId', '')`,
      noteType: sql<string>`coalesce(${aiMemoryItems.provenance}->>'noteType', '')`,
    })
    .from(aiMemoryItems)
    .where(and(eq(aiMemoryItems.userId, userId), eq(aiMemoryItems.memoryType, 'session_note')));

  const existingKeys = new Set(
    existingSessionIds.map((item) => `${item.sessionId}:${item.noteType}`)
  );

  const pendingValues: (typeof aiMemoryItems.$inferInsert)[] = [];

  for (const session of recentSessions) {
    const noteEntries = [
      { type: 'mentor_note', content: session.mentorNotes },
      { type: 'mentee_note', content: session.menteeNotes },
    ].filter((entry) => entry.content && entry.content.trim().length > 0);

    for (const note of noteEntries) {
      const key = `${session.id}:${note.type}`;
      if (existingKeys.has(key)) {
        continue;
      }

      pendingValues.push({
        userId,
        memoryType: 'session_note',
        content: note.content!.trim(),
        confidence: '0.850',
        provenance: {
          sessionId: session.id,
          noteType: note.type,
          source: 'session_notes',
          sessionUpdatedAt: session.updatedAt.toISOString(),
        },
      });
    }
  }

  if (pendingValues.length > 0) {
    await db.insert(aiMemoryItems).values(pendingValues);
  }
}

export async function getOrCreateConversation(
  actor: AiActorContext,
  surface: string
): Promise<AiConversationSummary> {
  const crossChatMemoryEnabled = getInfinityAiServerConfig().crossChatMemoryEnabled;

  if (crossChatMemoryEnabled && actor.userId) {
    await syncSessionNoteMemories(actor.userId);
  }

  const claimedConversation = await claimAnonymousConversationForUser(actor, surface);
  if (claimedConversation) {
    return toConversationSummary(claimedConversation);
  }

  const existingRows = await db
    .select()
    .from(aiConversations)
    .where(
      actor.userId != null
        ? and(
            eq(aiConversations.userId, actor.userId),
            eq(aiConversations.surface, surface),
            eq(aiConversations.status, 'active')
          )
        : and(
            eq(aiConversations.anonymousSessionId, actor.anonymousSessionId ?? ''),
            eq(aiConversations.surface, surface),
            eq(aiConversations.status, 'active')
          )
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(1);

  const existing = existingRows[0];

  if (existing) {
    return toConversationSummary(existing);
  }

  const memoryItems =
    crossChatMemoryEnabled && actor.userId != null
      ? await listRecentMemoryItems(actor.userId, 6)
      : [];

  const [created] = await db
    .insert(aiConversations)
    .values({
      userId: actor.userId,
      anonymousSessionId: actor.anonymousSessionId,
      surface,
      status: 'active',
      phase: 'discovery',
      depthMode: 'light',
      signalSnapshot: {},
      memorySnapshot: {
        items: memoryItems,
      },
      readinessSnapshot: null,
    })
    .returning();

  return toConversationSummary(created);
}

export async function createNewConversation(
  actor: AiActorContext,
  surface: string
): Promise<AiConversationSummary> {
  const crossChatMemoryEnabled = getInfinityAiServerConfig().crossChatMemoryEnabled;

  if (crossChatMemoryEnabled && actor.userId) {
    await syncSessionNoteMemories(actor.userId);
  }

  const memoryItems =
    crossChatMemoryEnabled && actor.userId != null
      ? await listRecentMemoryItems(actor.userId, 6)
      : [];

  const [created] = await db
    .insert(aiConversations)
    .values({
      userId: actor.userId,
      anonymousSessionId: actor.anonymousSessionId,
      surface,
      status: 'active',
      phase: 'discovery',
      depthMode: 'light',
      signalSnapshot: {},
      memorySnapshot: {
        items: memoryItems,
      },
      readinessSnapshot: null,
    })
    .returning();

  return toConversationSummary(created);
}

export async function getConversationBootstrap(
  actor: AiActorContext,
  surface: string
) {
  const conversation = await getOrCreateConversation(actor, surface);
  const turns = await listConversationTurns(conversation.id, 14);

  return {
    conversation,
    turns,
  };
}

export async function startAiGraphRun(
  input: AiGraphRunStartRequest
): Promise<AiGraphRunStartResponse> {
  const conversation = await getConversationForActor(input.conversationId, input.actor);
  if (!conversation) {
    throw new Error('Conversation not found for actor');
  }

  return db.transaction(async (tx) => {
    const [userTurn] = await tx
      .insert(aiTurns)
      .values({
        conversationId: input.conversationId,
        actor: 'user',
        inputText: input.userMessage,
        traceMetadata: {
          traceId: input.traceId,
          graphStatus: 'running',
        },
      })
      .returning();

    const [graphRun] = await tx
      .insert(aiGraphRuns)
      .values({
        conversationId: input.conversationId,
        userTurnId: userTurn.id,
        graphVersion: input.graphVersion,
        status: 'running',
        stateBefore: input.stateBefore,
        nodeTraces: [],
        modelCalls: [],
        selectedExpertIds: [],
        startedAt: new Date(),
      })
      .returning();

    return {
      graphRunId: graphRun.id,
      userTurnId: userTurn.id,
    };
  });
}

export async function markAiGraphRunFailed(input: AiGraphRunFailureRequest) {
  const conversation = await getConversationForActor(input.conversationId, input.actor);
  if (!conversation) {
    throw new Error('Conversation not found for actor');
  }

  const [updated] = await db
    .update(aiGraphRuns)
    .set({
      status: 'failed',
      phaseBefore: input.phaseBefore ?? null,
      phaseAfter: input.phaseAfter ?? null,
      stateAfter: input.stateAfter,
      nodeTraces: input.nodeTraces,
      modelCalls: input.modelCalls,
      selectedExpertIds: input.selectedExpertIds,
      error: input.error,
      completedAt: new Date(),
    })
    .where(and(eq(aiGraphRuns.id, input.graphRunId), eq(aiGraphRuns.conversationId, input.conversationId)))
    .returning();

  if (input.userTurnId) {
    await db
      .update(aiTurns)
      .set({
        traceMetadata: {
          graphRunId: input.graphRunId,
          graphStatus: 'failed',
          phaseBefore: input.phaseBefore ?? null,
          phaseAfter: input.phaseAfter ?? null,
          error: input.error,
        },
      })
      .where(and(eq(aiTurns.id, input.userTurnId), eq(aiTurns.conversationId, input.conversationId)));
  }

  return updated ? toGraphRun(updated) : null;
}

export async function persistAiExchange(input: AiPersistRequest): Promise<AiPersistResponse> {
  const conversation = await getConversationForActor(input.conversationId, input.actor);
  if (!conversation) {
    throw new Error('Conversation not found for actor');
  }
  const crossChatMemoryEnabled = getInfinityAiServerConfig().crossChatMemoryEnabled;

  return db.transaction(async (tx) => {
    const traceId = String(input.traceMetadata.traceId ?? randomUUID());
    const traceMetadata = completePendingPersistTrace(input.traceMetadata);
    const [userTurn] = input.userTurnId
      ? await tx
          .update(aiTurns)
          .set({
            inputText: input.userMessage,
            signalDelta: input.signalUpdates,
            traceMetadata: {
              traceId,
              graphRunId: input.graphRunId ?? null,
              graphStatus: 'completed',
              phaseBefore: conversation.phase,
            },
          })
          .where(and(eq(aiTurns.id, input.userTurnId), eq(aiTurns.conversationId, input.conversationId)))
          .returning()
      : await tx
          .insert(aiTurns)
          .values({
            conversationId: input.conversationId,
            actor: 'user',
            inputText: input.userMessage,
            signalDelta: input.signalUpdates,
            traceMetadata: {
              traceId,
              graphRunId: input.graphRunId ?? null,
              graphStatus: 'completed',
              phaseBefore: conversation.phase,
            },
          })
          .returning();

    let recommendationRunId: string | null = null;

    if (input.recommendationRun) {
      const [run] = await tx
        .insert(aiRecommendationRuns)
        .values({
          conversationId: input.conversationId,
          userId: input.actor.userId,
          inputSignalSnapshot: input.stateUpdates.signalSnapshot,
          algorithmVersion: input.recommendationRun.algorithmVersion,
          candidateCount: input.recommendationRun.candidateCount,
          selectedCount: input.recommendationRun.selectedCount,
          traceMetadata: input.recommendationRun.traceMetadata,
        })
        .returning();

      recommendationRunId = run.id;

      if (input.recommendationRun.candidates.length > 0) {
        await tx.insert(aiRecommendationCandidates).values(
          input.recommendationRun.candidates.map((candidate) => ({
            runId: run.id,
            mentorProfileId: candidate.mentorProfileId,
            mentorUserId: candidate.mentorUserId,
            eligibilityStatus: candidate.eligibilityStatus,
            intentMatchScore: candidate.intentMatchScore.toFixed(3),
            outcomeMatchScore: candidate.outcomeMatchScore.toFixed(3),
            personaMatchScore: candidate.personaMatchScore.toFixed(3),
            expertiseRelevanceScore: candidate.expertiseRelevanceScore.toFixed(3),
            conversionProbabilityScore: candidate.conversionProbabilityScore.toFixed(3),
            adminPriorityScore: candidate.adminPriorityScore.toFixed(3),
            exposureBalancingScore: candidate.exposureBalancingScore.toFixed(3),
            finalScore: candidate.finalScore.toFixed(4),
            slotType: candidate.slotType ?? null,
            selected: candidate.selected,
            scoreExplanation: candidate.scoreExplanation,
          }))
        );
      }
    }

    const [assistantTurn] = await tx
      .insert(aiTurns)
      .values({
        conversationId: input.conversationId,
        actor: 'assistant',
        responseBlocks: input.responseBlocks,
        signalDelta: input.signalUpdates,
        modelMetadata: {
          recommendationRunId,
          llmCalls: traceMetadata.llmCalls ?? [],
          graphRunId: input.graphRunId ?? null,
        },
        traceMetadata,
      })
      .returning();

    if (input.signalUpdates.length > 0) {
      await tx.insert(aiUserSignals).values(
        input.signalUpdates.map((signal) => ({
          conversationId: input.conversationId,
          userId: input.actor.userId,
          signalType: signal.signalType,
          signalValue: signal.signalValue,
          confidence: signal.confidence.toFixed(3),
          evidence: {
            items: signal.evidence,
          },
          sourceTurnId: userTurn.id,
        }))
      );
    }

    if (crossChatMemoryEnabled && input.actor.userId && input.memoryUpdates.length > 0) {
      await tx.insert(aiMemoryItems).values(
        input.memoryUpdates.map((memory) => ({
          userId: input.actor.userId!,
          conversationId: input.conversationId,
          memoryType: memory.memoryType,
          content: memory.content,
          confidence: memory.confidence.toFixed(3),
          provenance: memory.provenance,
        }))
      );
    }

    const [updatedConversation] = await tx
      .update(aiConversations)
      .set({
        ...(input.actor.userId ? { userId: input.actor.userId } : {}),
        phase: input.stateUpdates.phase,
        depthMode: input.stateUpdates.depthMode,
        signalSnapshot: input.stateUpdates.signalSnapshot,
        memorySnapshot: crossChatMemoryEnabled ? input.stateUpdates.memorySnapshot : {},
        readinessSnapshot: input.stateUpdates.readinessSnapshot ?? null,
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, input.conversationId))
      .returning();

    if (input.graphRunId) {
      await tx
        .update(aiGraphRuns)
        .set({
          assistantTurnId: assistantTurn.id,
          status: 'completed',
          phaseBefore: conversation.phase,
          phaseAfter: input.stateUpdates.phase,
          stateAfter: (traceMetadata.stateAfter ?? {}) as Record<string, unknown>,
          nodeTraces: (traceMetadata.nodeTraces ?? []) as Record<string, unknown>[],
          modelCalls: (traceMetadata.llmCalls ?? []) as Record<string, unknown>[],
          selectedExpertIds: (traceMetadata.selectedExpertIds ?? []) as string[],
          recommendationRunId,
          error: null,
          completedAt: new Date(),
        })
        .where(and(eq(aiGraphRuns.id, input.graphRunId), eq(aiGraphRuns.conversationId, input.conversationId)));
    }

    return {
      conversation: toConversationSummary(updatedConversation),
      assistantTurn: toConversationTurn(assistantTurn),
      userTurnId: userTurn.id,
      graphRunId: input.graphRunId ?? null,
      recommendationRunId,
    };
  });
}

export async function getInfinityConversationTrace(conversationId: string) {
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return null;
  }

  const [
    turnRows,
    graphRunRows,
    signalRows,
    memoryRows,
    recommendationRunRows,
    recommendationEventRows,
  ] = await Promise.all([
    db
      .select()
      .from(aiTurns)
      .where(eq(aiTurns.conversationId, conversationId))
      .orderBy(aiTurns.createdAt),
    db
      .select()
      .from(aiGraphRuns)
      .where(eq(aiGraphRuns.conversationId, conversationId))
      .orderBy(aiGraphRuns.createdAt),
    db
      .select()
      .from(aiUserSignals)
      .where(eq(aiUserSignals.conversationId, conversationId))
      .orderBy(aiUserSignals.createdAt),
    db
      .select()
      .from(aiMemoryItems)
      .where(eq(aiMemoryItems.conversationId, conversationId))
      .orderBy(aiMemoryItems.createdAt),
    db
      .select()
      .from(aiRecommendationRuns)
      .where(eq(aiRecommendationRuns.conversationId, conversationId))
      .orderBy(aiRecommendationRuns.createdAt),
    db
      .select()
      .from(aiRecommendationEvents)
      .where(eq(aiRecommendationEvents.conversationId, conversationId))
      .orderBy(aiRecommendationEvents.createdAt),
  ]);

  const recommendationRunIds = recommendationRunRows.map((run) => run.id);
  const candidateRows = recommendationRunIds.length
    ? await db
        .select()
        .from(aiRecommendationCandidates)
        .where(inArray(aiRecommendationCandidates.runId, recommendationRunIds))
    : [];

  return {
    conversation: toConversationSummary(conversation),
    turns: turnRows.map(toConversationTurn),
    graphRuns: graphRunRows.map(toGraphRun),
    nodeTraces: graphRunRows.flatMap((run) => (run.nodeTraces ?? []) as Record<string, unknown>[]),
    llmCalls: graphRunRows.flatMap((run) => (run.modelCalls ?? []) as Record<string, unknown>[]),
    signalSnapshots: {
      current: (conversation.signalSnapshot ?? {}) as Record<string, unknown>,
      updates: signalRows.map((signal) => ({
        id: signal.id,
        signalType: signal.signalType,
        signalValue: signal.signalValue,
        confidence: Number(signal.confidence),
        evidence: signal.evidence,
        sourceTurnId: signal.sourceTurnId,
        createdAt: signal.createdAt.toISOString(),
      })),
    },
    memoryUpdates: memoryRows.map(toMemoryItem),
    recommendationRuns: recommendationRunRows.map((run) => ({
      id: run.id,
      conversationId: run.conversationId,
      userId: run.userId,
      inputSignalSnapshot: run.inputSignalSnapshot,
      algorithmVersion: run.algorithmVersion,
      candidateCount: run.candidateCount,
      selectedCount: run.selectedCount,
      traceMetadata: run.traceMetadata,
      createdAt: run.createdAt.toISOString(),
      candidates: candidateRows
        .filter((candidate) => candidate.runId === run.id)
        .map((candidate) => ({
          id: candidate.id,
          mentorProfileId: candidate.mentorProfileId,
          mentorUserId: candidate.mentorUserId,
          eligibilityStatus: candidate.eligibilityStatus,
          intentMatchScore: Number(candidate.intentMatchScore),
          outcomeMatchScore: Number(candidate.outcomeMatchScore),
          personaMatchScore: Number(candidate.personaMatchScore),
          expertiseRelevanceScore: Number(candidate.expertiseRelevanceScore),
          conversionProbabilityScore: Number(candidate.conversionProbabilityScore),
          adminPriorityScore: Number(candidate.adminPriorityScore),
          exposureBalancingScore: Number(candidate.exposureBalancingScore),
          finalScore: Number(candidate.finalScore),
          slotType: candidate.slotType,
          selected: candidate.selected,
          scoreExplanation: candidate.scoreExplanation,
          createdAt: candidate.createdAt.toISOString(),
        })),
    })),
    recommendationEvents: recommendationEventRows.map((event) => ({
      id: event.id,
      runId: event.runId,
      conversationId: event.conversationId,
      userId: event.userId,
      mentorProfileId: event.mentorProfileId,
      candidateType: event.candidateType,
      entityId: event.entityId,
      mentorUserId: event.mentorUserId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      eventType: event.eventType,
      metadata: event.metadata,
      idempotencyKey: event.idempotencyKey,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function recordRecommendationEvent(input: {
  conversationId?: string | null;
  runId?: string | null;
  userId?: string | null;
  mentorProfileId?: string | null;
  mentorUserId?: string | null;
  candidateType?: 'expert' | 'resource' | null;
  entityId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  eventType: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  const candidateType =
    input.candidateType ?? (input.resourceId ? 'resource' : input.mentorProfileId ? 'expert' : null);
  const entityId = input.entityId ?? input.resourceId ?? input.mentorProfileId ?? null;
  const metadata = {
    ...(input.metadata ?? {}),
    ...(candidateType ? { candidateType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(input.mentorUserId ? { mentorUserId: input.mentorUserId } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
  };

  await db
    .insert(aiRecommendationEvents)
    .values({
      conversationId: input.conversationId ?? null,
      runId: input.runId ?? null,
      userId: input.userId ?? null,
      mentorProfileId: input.mentorProfileId ?? null,
      candidateType,
      entityId,
      mentorUserId: input.mentorUserId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      metadata,
    })
    .onConflictDoNothing({
      target: aiRecommendationEvents.idempotencyKey,
    });
}

export async function findBookingAttributionForSession(sessionId: string) {
  const row = await db
    .select()
    .from(aiRecommendationEvents)
    .where(
      and(
        eq(aiRecommendationEvents.eventType, 'booking_attributed'),
        sql`${aiRecommendationEvents.metadata}->>'sessionId' = ${sessionId}`
      )
    )
    .orderBy(desc(aiRecommendationEvents.createdAt))
    .limit(1);

  return row[0] ?? null;
}

export async function countPreviousAiBookingsForPair(input: {
  mentorUserId: string;
  menteeUserId: string;
}) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.mentorId, input.mentorUserId),
        eq(sessions.menteeId, input.menteeUserId),
        eq(sessions.bookingSource, 'ai')
      )
    );

  return rows[0]?.count ?? 0;
}

export async function loadConversationSummaries(conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(aiConversations)
    .where(inArray(aiConversations.id, conversationIds));

  return rows.map(toConversationSummary);
}
