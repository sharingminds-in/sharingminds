import { z } from 'zod';

export const infinityAiPhases = [
  'discovery',
  'clarifying',
  'mini_clarity',
  'micro_consent',
  'framework',
  'expert_elevation',
  'expert_recommendation',
  'session_readiness',
  'continuity',
] as const;

export const infinityAiDepthModes = ['light', 'standard', 'deep'] as const;

export const infinityResponseBlockTypes = [
  'soft_response',
  'reflection',
  'clarification',
  'insight',
  'direction',
  'micro_consent',
  'mini_framework',
  'expert_elevation',
  'expert_cards',
  'resource_cards',
  'session_readiness',
  'sign_in_cta',
  'continuity',
  'no_match',
  'system_notice',
] as const;

export const recommendationEventTypes = [
  'impression',
  'click',
  'booking_attributed',
  'completion_attributed',
  'review_attributed',
  'repeat_booking_attributed',
] as const;

export const aiSignalTypes = [
  'intent',
  'outcome',
  'stage',
  'emotion',
  'urgency',
  'geography',
  'industry',
  'constraint',
  'budget',
  'study_level',
  'subject_field',
  'timeline',
  'feasibility_flag',
  'consent',
  'clarity_level',
  'support_boundary',
  'readiness_focus',
] as const;

export const aiConversationPhaseSchema = z.enum(infinityAiPhases);
export const aiDepthModeSchema = z.enum(infinityAiDepthModes);
export const aiResponseBlockTypeSchema = z.enum(infinityResponseBlockTypes);
export const aiSignalTypeSchema = z.enum(aiSignalTypes);
export const recommendationEventTypeSchema = z.enum(recommendationEventTypes);

export const aiActorContextSchema = z
  .object({
    userId: z.string().nullable(),
    anonymousSessionId: z.string().trim().min(1).nullable(),
    surface: z.string().trim().min(1),
    authenticated: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.userId && !value.anonymousSessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'userId or anonymousSessionId is required',
        path: ['anonymousSessionId'],
      });
    }
  });

export const aiSignalEvidenceSchema = z.object({
  source: z.string(),
  excerpt: z.string().optional(),
  detail: z.string().optional(),
});

export const aiSignalUpdateSchema = z.object({
  signalType: aiSignalTypeSchema,
  signalValue: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(aiSignalEvidenceSchema).default([]),
});

export const aiMiniFrameworkItemSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export const aiExpertCardSchema = z.object({
  mentorProfileId: z.string().uuid(),
  mentorUserId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().nullable(),
  company: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  image: z.string().nullable(),
  headline: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  currency: z.string().nullable(),
  expertise: z.array(z.string()).default([]),
  reasonSummary: z.string().min(1).nullable().optional(),
  scoreSummary: z.array(z.string()).default([]),
  slotType: z.string().nullable(),
  finalScore: z.number().min(0).max(1),
});

export const aiResourceCardSchema = z.object({
  resourceId: z.string().uuid(),
  resourceType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  href: z.string().min(1),
  source: z.string().min(1).default('courses'),
  visibility: z.string().min(1).default('public'),
  providerName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  learningOutcomes: z.array(z.string()).default([]),
  scoreSummary: z.array(z.string()).default([]),
  slotType: z.string().nullable().optional(),
  finalScore: z.number().min(0).max(1),
});

export const aiResponseBlockSchema = z.object({
  type: aiResponseBlockTypeSchema,
  title: z.string().optional(),
  content: z.string().optional(),
  question: z.string().optional(),
  suggestedReply: z.string().optional(),
  items: z.array(aiMiniFrameworkItemSchema).optional(),
  experts: z.array(aiExpertCardSchema).optional(),
  resources: z.array(aiResourceCardSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const aiSessionReadinessSnapshotSchema = z.object({
  summary: z.string().min(1),
  focusAreas: z.array(z.string()).default([]),
  decisionsToClarify: z.array(z.string()).default([]),
  constraintsToShare: z.array(z.string()).default([]),
  questionsToAsk: z.array(z.string()).default([]),
});

export const aiMemoryItemSchema = z.object({
  id: z.string().uuid().optional(),
  memoryType: z.string().min(1),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenance: z.record(z.string(), z.unknown()).default({}),
});

export const aiUserMemoryItemSchema = z.object({
  id: z.string().uuid(),
  memoryType: z.string().min(1),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenanceSummary: z.string().nullable(),
  conversationId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const aiUserMemoryResponseSchema = z.object({
  memories: z.array(aiUserMemoryItemSchema),
});

export const aiConversationSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().nullable().optional(),
  anonymousSessionId: z.string().nullable().optional(),
  surface: z.string(),
  status: z.string(),
  phase: aiConversationPhaseSchema,
  depthMode: aiDepthModeSchema,
  signalSnapshot: z.record(z.string(), z.unknown()).default({}),
  memorySnapshot: z.record(z.string(), z.unknown()).default({}),
  readinessSnapshot: aiSessionReadinessSnapshotSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const aiConversationTurnSchema = z.object({
  id: z.string().uuid(),
  actor: z.string(),
  inputText: z.string().nullable().optional(),
  responseBlocks: z.array(aiResponseBlockSchema).nullable().optional(),
  traceMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});

export const aiGraphRunStatusSchema = z.enum(['running', 'completed', 'failed']);

export const aiGraphRunSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  userTurnId: z.string().uuid().nullable().optional(),
  assistantTurnId: z.string().uuid().nullable().optional(),
  graphVersion: z.string(),
  status: aiGraphRunStatusSchema,
  phaseBefore: z.string().nullable().optional(),
  phaseAfter: z.string().nullable().optional(),
  stateBefore: z.record(z.string(), z.unknown()).default({}),
  stateAfter: z.record(z.string(), z.unknown()).default({}),
  nodeTraces: z.array(z.record(z.string(), z.unknown())).default([]),
  modelCalls: z.array(z.record(z.string(), z.unknown())).default([]),
  selectedExpertIds: z.array(z.string()).default([]),
  recommendationRunId: z.string().uuid().nullable().optional(),
  error: z.record(z.string(), z.unknown()).nullable().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const aiConversationBootstrapSchema = z.object({
  conversation: aiConversationSummarySchema,
  turns: z.array(aiConversationTurnSchema),
});

export const createInfinityConversationInputSchema = z.object({
  surface: z.string().trim().min(1).default('landing_page'),
  anonymousSessionId: z.string().trim().min(1).optional(),
  forceNew: z.boolean().optional().default(false),
});

export const infinityConversationMessageInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  anonymousSessionId: z.string().trim().min(1).optional(),
});

export const aiFeatureFlagsSchema = z.object({
  enabled: z.boolean(),
  requireLlm: z.boolean(),
  anonymousEnabled: z.boolean(),
  anonymousExpertPreviewEnabled: z.boolean().default(false),
  crossChatMemoryEnabled: z.boolean().default(false),
  pgvectorEnabled: z.boolean(),
  adminBoostsEnabled: z.boolean(),
});

export const aiPolicyContextSchema = z.object({
  conversation: aiConversationSummarySchema,
  turns: z.array(aiConversationTurnSchema),
  memoryItems: z.array(aiMemoryItemSchema),
  actor: aiActorContextSchema,
  policy: z.object({
    canBookSessions: z.boolean(),
    canRecommendExperts: z.boolean().default(false),
    canRecommendResources: z.boolean().default(false),
    resourceVisibility: z.enum(['public_only']).default('public_only'),
    allowAnonymous: z.boolean(),
    requiresAuthForBooking: z.boolean(),
    bookingSource: z.literal('ai'),
    maxExperts: z.number().int().min(1).max(3).default(3),
    featureFlags: aiFeatureFlagsSchema,
  }),
});

export const aiAdminBoostRuleSchema = z.object({
  id: z.string().uuid(),
  mentorProfileId: z.string().uuid(),
  ruleType: z.string(),
  categoryScope: z.record(z.string(), z.unknown()).default({}),
  priorityMultiplier: z.number(),
  inclusionPercentageCap: z.number().int().min(0).max(100),
  maxImpressions: z.number().int().nullable().optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  status: z.string(),
  reason: z.string(),
});

export const aiExpertCandidateSchema = z.object({
  mentorProfileId: z.string().uuid(),
  mentorUserId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().nullable(),
  company: z.string().nullable(),
  industry: z.string().nullable(),
  headline: z.string().nullable(),
  about: z.string().nullable(),
  image: z.string().nullable(),
  location: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  currency: z.string().nullable(),
  experienceYears: z.number().int().nullable(),
  expertise: z.array(z.string()).default([]),
  intentTags: z.array(z.string()).default([]),
  outcomeTags: z.array(z.string()).default([]),
  industryTags: z.array(z.string()).default([]),
  personaFitTags: z.array(z.string()).default([]),
  keywordTrustScore: z.number().min(0).max(1),
  contentAuthorityScore: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  conversionScore: z.number().min(0).max(1),
  allocationSnapshot: z.record(z.string(), z.unknown()).default({}),
  metadataQualityStatus: z.string(),
  metrics: z.object({
    completedSessions: z.number().int().nonnegative(),
    cancelledSessions: z.number().int().nonnegative(),
    avgReviewScore: z.number().min(0).max(5),
    reviewCount: z.number().int().nonnegative(),
    recentImpressions7d: z.number().int().nonnegative(),
    recentClicks7d: z.number().int().nonnegative(),
    recentBookings30d: z.number().int().nonnegative(),
    recentCompletions90d: z.number().int().nonnegative(),
    lastShownAt: z.string().nullable(),
  }),
  activeBoostRules: z.array(aiAdminBoostRuleSchema).default([]),
});

export const aiExpertCandidatesRequestSchema = z.object({
  conversationId: z.string().uuid(),
  actor: aiActorContextSchema,
  signalSnapshot: z.record(z.string(), z.unknown()).default({}),
});

export const aiExpertCandidatesResponseSchema = z.object({
  candidates: z.array(aiExpertCandidateSchema),
  policyBlocked: z.boolean().default(false),
});

export const aiResourceCandidatesRequestSchema = z.object({
  conversationId: z.string().uuid(),
  actor: aiActorContextSchema,
  signalSnapshot: z.record(z.string(), z.unknown()).default({}),
  userMessage: z.string().min(1).max(4000),
});

export const aiResourceCandidateSchema = z.object({
  resourceId: z.string().uuid(),
  resourceType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  href: z.string().min(1),
  source: z.string().min(1).default('courses'),
  visibility: z.string().min(1).default('public'),
  providerName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  learningOutcomes: z.array(z.string()).default([]),
  intentTags: z.array(z.string()).default([]),
  outcomeTags: z.array(z.string()).default([]),
  avgRating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().nonnegative().default(0),
  enrollmentCount: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const aiResourceCandidatesResponseSchema = z.object({
  candidates: z.array(aiResourceCandidateSchema),
  visibility: z.literal('public').default('public'),
  policyBlocked: z.boolean().default(false),
});

export const aiRecommendationCandidateResultSchema = z.object({
  mentorProfileId: z.string().uuid(),
  mentorUserId: z.string().min(1),
  eligibilityStatus: z.string(),
  intentMatchScore: z.number().min(0).max(1),
  outcomeMatchScore: z.number().min(0).max(1),
  personaMatchScore: z.number().min(0).max(1),
  expertiseRelevanceScore: z.number().min(0).max(1),
  conversionProbabilityScore: z.number().min(0).max(1),
  adminPriorityScore: z.number().min(0).max(1),
  exposureBalancingScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  slotType: z.string().nullable().optional(),
  selected: z.boolean(),
  scoreExplanation: z.record(z.string(), z.unknown()).default({}),
});

export const aiRecommendationRunSchema = z.object({
  algorithmVersion: z.string(),
  candidateCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  traceMetadata: z.record(z.string(), z.unknown()).default({}),
  candidates: z.array(aiRecommendationCandidateResultSchema),
});

export const aiGraphRunStartRequestSchema = z.object({
  conversationId: z.string().uuid(),
  actor: aiActorContextSchema,
  userMessage: z.string().min(1),
  graphVersion: z.string().min(1),
  traceId: z.string().min(1),
  stateBefore: z.record(z.string(), z.unknown()).default({}),
});

export const aiGraphRunStartResponseSchema = z.object({
  graphRunId: z.string().uuid(),
  userTurnId: z.string().uuid(),
});

export const aiGraphRunFailureRequestSchema = z.object({
  conversationId: z.string().uuid(),
  actor: aiActorContextSchema,
  graphRunId: z.string().uuid(),
  userTurnId: z.string().uuid().optional(),
  phaseBefore: z.string().nullable().optional(),
  phaseAfter: z.string().nullable().optional(),
  stateAfter: z.record(z.string(), z.unknown()).default({}),
  nodeTraces: z.array(z.record(z.string(), z.unknown())).default([]),
  modelCalls: z.array(z.record(z.string(), z.unknown())).default([]),
  selectedExpertIds: z.array(z.string()).default([]),
  error: z.record(z.string(), z.unknown()).default({}),
});

export const aiPersistRequestSchema = z.object({
  conversationId: z.string().uuid(),
  actor: aiActorContextSchema,
  userTurnId: z.string().uuid().optional(),
  graphRunId: z.string().uuid().optional(),
  userMessage: z.string().min(1),
  responseBlocks: z.array(aiResponseBlockSchema),
  stateUpdates: z.object({
    phase: aiConversationPhaseSchema,
    depthMode: aiDepthModeSchema,
    signalSnapshot: z.record(z.string(), z.unknown()).default({}),
    memorySnapshot: z.record(z.string(), z.unknown()).default({}),
    readinessSnapshot: aiSessionReadinessSnapshotSchema.nullable().optional(),
  }),
  signalUpdates: z.array(aiSignalUpdateSchema).default([]),
  recommendationRun: aiRecommendationRunSchema.nullable().optional(),
  memoryUpdates: z.array(aiMemoryItemSchema).default([]),
  traceMetadata: z.record(z.string(), z.unknown()).default({}),
});

export const aiPersistResponseSchema = z.object({
  conversation: aiConversationSummarySchema,
  assistantTurn: aiConversationTurnSchema,
  userTurnId: z.string().uuid().nullable().optional(),
  graphRunId: z.string().uuid().nullable().optional(),
  recommendationRunId: z.string().uuid().nullable().optional(),
});

export const aiServiceMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  userMessage: z.string().min(1),
  actor: aiActorContextSchema,
  platformBaseUrl: z.string().url(),
});

export const aiServiceMessageResponseSchema = z.object({
  responseBlocks: z.array(aiResponseBlockSchema),
  stateUpdates: aiPersistRequestSchema.shape.stateUpdates,
  signalUpdates: z.array(aiSignalUpdateSchema),
  recommendationRun: aiRecommendationRunSchema.nullable().optional(),
  memoryUpdates: z.array(aiMemoryItemSchema),
  traceMetadata: z.record(z.string(), z.unknown()).default({}),
  persistedConversation: aiConversationSummarySchema.nullable().optional(),
  persistedAssistantTurn: aiConversationTurnSchema.nullable().optional(),
  persistedGraphRunId: z.string().uuid().nullable().optional(),
  persistedRecommendationRunId: z.string().uuid().nullable().optional(),
});

export const aiRecommendationEventInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  mentorProfileId: z.string().uuid().optional(),
  mentorUserId: z.string().optional(),
  candidateType: z.enum(['expert', 'resource']).optional(),
  entityId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  eventType: recommendationEventTypeSchema,
  idempotencyKey: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AiActorContext = z.infer<typeof aiActorContextSchema>;
export type AiConversationBootstrap = z.infer<typeof aiConversationBootstrapSchema>;
export type AiConversationSummary = z.infer<typeof aiConversationSummarySchema>;
export type AiConversationTurn = z.infer<typeof aiConversationTurnSchema>;
export type AiGraphRun = z.infer<typeof aiGraphRunSchema>;
export type AiExpertCard = z.infer<typeof aiExpertCardSchema>;
export type AiResponseBlock = z.infer<typeof aiResponseBlockSchema>;
export type AiResourceCard = z.infer<typeof aiResourceCardSchema>;
export type AiSessionReadinessSnapshot = z.infer<typeof aiSessionReadinessSnapshotSchema>;
export type AiSignalUpdate = z.infer<typeof aiSignalUpdateSchema>;
export type AiMemoryItem = z.infer<typeof aiMemoryItemSchema>;
export type AiUserMemoryItem = z.infer<typeof aiUserMemoryItemSchema>;
export type AiUserMemoryResponse = z.infer<typeof aiUserMemoryResponseSchema>;
export type AiPolicyContext = z.infer<typeof aiPolicyContextSchema>;
export type AiExpertCandidate = z.infer<typeof aiExpertCandidateSchema>;
export type AiResourceCandidate = z.infer<typeof aiResourceCandidateSchema>;
export type AiRecommendationRun = z.infer<typeof aiRecommendationRunSchema>;
export type AiGraphRunStartRequest = z.infer<typeof aiGraphRunStartRequestSchema>;
export type AiGraphRunStartResponse = z.infer<typeof aiGraphRunStartResponseSchema>;
export type AiGraphRunFailureRequest = z.infer<typeof aiGraphRunFailureRequestSchema>;
export type AiPersistRequest = z.infer<typeof aiPersistRequestSchema>;
export type AiPersistResponse = z.infer<typeof aiPersistResponseSchema>;
export type AiServiceMessageRequest = z.infer<typeof aiServiceMessageRequestSchema>;
export type AiServiceMessageResponse = z.infer<typeof aiServiceMessageResponseSchema>;
