import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { mentors } from './mentors';
import { users } from './users';

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    anonymousSessionId: text('anonymous_session_id'),
    surface: text('surface').notNull(),
    status: text('status').notNull().default('active'),
    phase: text('phase').notNull().default('discovery'),
    depthMode: text('depth_mode').notNull().default('light'),
    signalSnapshot: jsonb('signal_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    memorySnapshot: jsonb('memory_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    readinessSnapshot: jsonb('readiness_snapshot').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userSurfaceIdx: index('ai_conversations_user_surface_idx').on(table.userId, table.surface),
    anonymousSurfaceIdx: index('ai_conversations_anonymous_surface_idx').on(
      table.anonymousSessionId,
      table.surface
    ),
    updatedAtIdx: index('ai_conversations_updated_at_idx').on(table.updatedAt),
  })
);

export const aiTurns = pgTable(
  'ai_turns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    inputText: text('input_text'),
    responseBlocks: jsonb('response_blocks').$type<Record<string, unknown>[] | null>(),
    signalDelta: jsonb('signal_delta').$type<Record<string, unknown> | unknown[] | null>(),
    modelMetadata: jsonb('model_metadata').$type<Record<string, unknown> | null>(),
    traceMetadata: jsonb('trace_metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    conversationCreatedIdx: index('ai_turns_conversation_created_idx').on(
      table.conversationId,
      table.createdAt
    ),
  })
);

export const aiGraphRuns = pgTable(
  'ai_graph_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userTurnId: uuid('user_turn_id').references(() => aiTurns.id, {
      onDelete: 'set null',
    }),
    assistantTurnId: uuid('assistant_turn_id').references(() => aiTurns.id, {
      onDelete: 'set null',
    }),
    graphVersion: text('graph_version').notNull(),
    status: text('status').notNull().default('running'),
    phaseBefore: text('phase_before'),
    phaseAfter: text('phase_after'),
    stateBefore: jsonb('state_before').$type<Record<string, unknown>>().notNull().default({}),
    stateAfter: jsonb('state_after').$type<Record<string, unknown>>().notNull().default({}),
    nodeTraces: jsonb('node_traces').$type<Record<string, unknown>[]>().notNull().default([]),
    modelCalls: jsonb('model_calls').$type<Record<string, unknown>[]>().notNull().default([]),
    selectedExpertIds: jsonb('selected_expert_ids').$type<string[]>().notNull().default([]),
    recommendationRunId: uuid('recommendation_run_id').references(() => aiRecommendationRuns.id, {
      onDelete: 'set null',
    }),
    error: jsonb('error').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: false }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    conversationCreatedIdx: index('ai_graph_runs_conversation_created_idx').on(
      table.conversationId,
      table.createdAt
    ),
    userTurnIdx: index('ai_graph_runs_user_turn_idx').on(table.userTurnId),
    statusIdx: index('ai_graph_runs_status_idx').on(table.status),
    recommendationRunIdx: index('ai_graph_runs_recommendation_run_idx').on(
      table.recommendationRunId
    ),
  })
);

export const aiUserSignals = pgTable(
  'ai_user_signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    signalType: text('signal_type').notNull(),
    signalValue: text('signal_value').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.500'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    sourceTurnId: uuid('source_turn_id').references(() => aiTurns.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    conversationTypeIdx: index('ai_user_signals_conversation_type_idx').on(
      table.conversationId,
      table.signalType
    ),
    userTypeIdx: index('ai_user_signals_user_type_idx').on(table.userId, table.signalType),
    updatedAtIdx: index('ai_user_signals_updated_at_idx').on(table.updatedAt),
  })
);

export const aiExpertProfiles = pgTable(
  'ai_expert_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mentorProfileId: uuid('mentor_profile_id')
      .notNull()
      .references(() => mentors.id, { onDelete: 'cascade' }),
    mentorUserId: text('mentor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    intentTags: jsonb('intent_tags').$type<string[]>().notNull().default([]),
    outcomeTags: jsonb('outcome_tags').$type<string[]>().notNull().default([]),
    industryTags: jsonb('industry_tags').$type<string[]>().notNull().default([]),
    personaFitTags: jsonb('persona_fit_tags').$type<string[]>().notNull().default([]),
    keywordTrustScore: numeric('keyword_trust_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.500'),
    contentAuthorityScore: numeric('content_authority_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    qualityScore: numeric('quality_score', { precision: 4, scale: 3 }).notNull().default('0.000'),
    conversionScore: numeric('conversion_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    allocationSnapshot: jsonb('allocation_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metadataQualityStatus: text('metadata_quality_status').notNull().default('derived'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    mentorProfileUnique: uniqueIndex('ai_expert_profiles_mentor_profile_uidx').on(
      table.mentorProfileId
    ),
    mentorUserIdx: index('ai_expert_profiles_mentor_user_idx').on(table.mentorUserId),
    qualityStatusIdx: index('ai_expert_profiles_quality_status_idx').on(table.metadataQualityStatus),
  })
);

export const aiAdminBoostRules = pgTable(
  'ai_admin_boost_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mentorProfileId: uuid('mentor_profile_id')
      .notNull()
      .references(() => mentors.id, { onDelete: 'cascade' }),
    ruleType: text('rule_type').notNull(),
    categoryScope: jsonb('category_scope')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    priorityMultiplier: numeric('priority_multiplier', { precision: 6, scale: 3 })
      .notNull()
      .default('1.000'),
    inclusionPercentageCap: integer('inclusion_percentage_cap').notNull().default(100),
    maxImpressions: integer('max_impressions'),
    startsAt: timestamp('starts_at', { withTimezone: false }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
    status: text('status').notNull().default('draft'),
    reason: text('reason').notNull(),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    mentorStatusIdx: index('ai_admin_boost_rules_mentor_status_idx').on(
      table.mentorProfileId,
      table.status
    ),
    startsAtIdx: index('ai_admin_boost_rules_starts_at_idx').on(table.startsAt),
    expiresAtIdx: index('ai_admin_boost_rules_expires_at_idx').on(table.expiresAt),
  })
);

export const aiRecommendationRuns = pgTable(
  'ai_recommendation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    inputSignalSnapshot: jsonb('input_signal_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    algorithmVersion: text('algorithm_version').notNull(),
    candidateCount: integer('candidate_count').notNull().default(0),
    selectedCount: integer('selected_count').notNull().default(0),
    traceMetadata: jsonb('trace_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    conversationCreatedIdx: index('ai_recommendation_runs_conversation_created_idx').on(
      table.conversationId,
      table.createdAt
    ),
    userCreatedIdx: index('ai_recommendation_runs_user_created_idx').on(table.userId, table.createdAt),
  })
);

export const aiRecommendationCandidates = pgTable(
  'ai_recommendation_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRecommendationRuns.id, { onDelete: 'cascade' }),
    mentorProfileId: uuid('mentor_profile_id')
      .notNull()
      .references(() => mentors.id, { onDelete: 'cascade' }),
    mentorUserId: text('mentor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eligibilityStatus: text('eligibility_status').notNull().default('eligible'),
    intentMatchScore: numeric('intent_match_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    outcomeMatchScore: numeric('outcome_match_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    personaMatchScore: numeric('persona_match_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    expertiseRelevanceScore: numeric('expertise_relevance_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    conversionProbabilityScore: numeric('conversion_probability_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    adminPriorityScore: numeric('admin_priority_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    exposureBalancingScore: numeric('exposure_balancing_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    finalScore: numeric('final_score', { precision: 5, scale: 4 }).notNull().default('0.0000'),
    slotType: text('slot_type'),
    selected: boolean('selected').notNull().default(false),
    scoreExplanation: jsonb('score_explanation')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    runMentorIdx: index('ai_recommendation_candidates_run_mentor_idx').on(
      table.runId,
      table.mentorProfileId
    ),
    runSelectedIdx: index('ai_recommendation_candidates_run_selected_idx').on(
      table.runId,
      table.selected
    ),
  })
);

export const aiRecommendationEvents = pgTable(
  'ai_recommendation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').references(() => aiRecommendationRuns.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id').references(() => aiConversations.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    mentorProfileId: uuid('mentor_profile_id').references(() => mentors.id, {
      onDelete: 'set null',
    }),
    candidateType: text('candidate_type'),
    entityId: text('entity_id'),
    mentorUserId: text('mentor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('ai_recommendation_events_idempotency_uidx').on(
      table.idempotencyKey
    ),
    conversationEventIdx: index('ai_recommendation_events_conversation_event_idx').on(
      table.conversationId,
      table.eventType
    ),
    mentorEventIdx: index('ai_recommendation_events_mentor_event_idx').on(
      table.mentorProfileId,
      table.eventType
    ),
    mentorUserEventIdx: index('ai_recommendation_events_mentor_user_event_idx').on(
      table.mentorUserId,
      table.eventType
    ),
    candidateEventIdx: index('ai_recommendation_events_candidate_event_idx').on(
      table.candidateType,
      table.entityId,
      table.eventType
    ),
    resourceEventIdx: index('ai_recommendation_events_resource_event_idx').on(
      table.resourceType,
      table.resourceId,
      table.eventType
    ),
    runIdx: index('ai_recommendation_events_run_idx').on(table.runId),
    createdAtIdx: index('ai_recommendation_events_created_at_idx').on(table.createdAt),
  })
);

export const aiMemoryItems = pgTable(
  'ai_memory_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => aiConversations.id, {
      onDelete: 'set null',
    }),
    memoryType: text('memory_type').notNull(),
    content: text('content').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.500'),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userTypeIdx: index('ai_memory_items_user_type_idx').on(table.userId, table.memoryType),
    userUpdatedIdx: index('ai_memory_items_user_updated_idx').on(table.userId, table.updatedAt),
  })
);

export const aiConversationsRelations = relations(aiConversations, ({ many }) => ({
  turns: many(aiTurns),
  graphRuns: many(aiGraphRuns),
  signals: many(aiUserSignals),
  recommendationRuns: many(aiRecommendationRuns),
}));

export const aiTurnsRelations = relations(aiTurns, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiTurns.conversationId],
    references: [aiConversations.id],
  }),
}));

export const aiGraphRunsRelations = relations(aiGraphRuns, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiGraphRuns.conversationId],
    references: [aiConversations.id],
  }),
  userTurn: one(aiTurns, {
    fields: [aiGraphRuns.userTurnId],
    references: [aiTurns.id],
  }),
  assistantTurn: one(aiTurns, {
    fields: [aiGraphRuns.assistantTurnId],
    references: [aiTurns.id],
  }),
  recommendationRun: one(aiRecommendationRuns, {
    fields: [aiGraphRuns.recommendationRunId],
    references: [aiRecommendationRuns.id],
  }),
}));

export const aiUserSignalsRelations = relations(aiUserSignals, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiUserSignals.conversationId],
    references: [aiConversations.id],
  }),
  turn: one(aiTurns, {
    fields: [aiUserSignals.sourceTurnId],
    references: [aiTurns.id],
  }),
}));

export const aiRecommendationRunsRelations = relations(aiRecommendationRuns, ({ one, many }) => ({
  conversation: one(aiConversations, {
    fields: [aiRecommendationRuns.conversationId],
    references: [aiConversations.id],
  }),
  candidates: many(aiRecommendationCandidates),
}));

export const aiRecommendationCandidatesRelations = relations(
  aiRecommendationCandidates,
  ({ one }) => ({
    run: one(aiRecommendationRuns, {
      fields: [aiRecommendationCandidates.runId],
      references: [aiRecommendationRuns.id],
    }),
    mentor: one(mentors, {
      fields: [aiRecommendationCandidates.mentorProfileId],
      references: [mentors.id],
    }),
  })
);

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiTurn = typeof aiTurns.$inferSelect;
export type NewAiTurn = typeof aiTurns.$inferInsert;
export type AiGraphRun = typeof aiGraphRuns.$inferSelect;
export type NewAiGraphRun = typeof aiGraphRuns.$inferInsert;
export type AiUserSignal = typeof aiUserSignals.$inferSelect;
export type NewAiUserSignal = typeof aiUserSignals.$inferInsert;
export type AiExpertProfile = typeof aiExpertProfiles.$inferSelect;
export type NewAiExpertProfile = typeof aiExpertProfiles.$inferInsert;
export type AiAdminBoostRule = typeof aiAdminBoostRules.$inferSelect;
export type NewAiAdminBoostRule = typeof aiAdminBoostRules.$inferInsert;
export type AiRecommendationRun = typeof aiRecommendationRuns.$inferSelect;
export type NewAiRecommendationRun = typeof aiRecommendationRuns.$inferInsert;
export type AiRecommendationCandidate = typeof aiRecommendationCandidates.$inferSelect;
export type NewAiRecommendationCandidate = typeof aiRecommendationCandidates.$inferInsert;
export type AiRecommendationEvent = typeof aiRecommendationEvents.$inferSelect;
export type NewAiRecommendationEvent = typeof aiRecommendationEvents.$inferInsert;
export type AiMemoryItem = typeof aiMemoryItems.$inferSelect;
export type NewAiMemoryItem = typeof aiMemoryItems.$inferInsert;
