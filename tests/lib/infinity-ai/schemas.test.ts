import { describe, expect, it } from 'vitest';

import { __infinityAiClientTest } from '@/lib/infinity-ai/client';
import {
  aiGraphRunFailureRequestSchema,
  aiGraphRunStartRequestSchema,
  aiServiceMessageResponseSchema,
} from '@/lib/infinity-ai/schemas';

const actor = {
  userId: 'user-1',
  anonymousSessionId: null,
  surface: 'landing_page',
  authenticated: true,
};

describe('Infinity AI graph schemas', () => {
  it('validates graph run start payloads', () => {
    const parsed = aiGraphRunStartRequestSchema.parse({
      conversationId: '11111111-1111-1111-1111-111111111111',
      actor,
      userMessage: 'I need help choosing a mentor',
      graphVersion: 'infinity-langgraph-v1',
      traceId: 'trace-1',
      stateBefore: {
        phase: 'discovery',
      },
    });

    expect(parsed.graphVersion).toBe('infinity-langgraph-v1');
    expect(parsed.stateBefore.phase).toBe('discovery');
  });

  it('validates failed graph run payloads with node traces and model calls', () => {
    const parsed = aiGraphRunFailureRequestSchema.parse({
      conversationId: '11111111-1111-1111-1111-111111111111',
      actor,
      graphRunId: '22222222-2222-2222-2222-222222222222',
      userTurnId: '33333333-3333-3333-3333-333333333333',
      phaseBefore: 'discovery',
      phaseAfter: 'mini_clarity',
      stateAfter: {
        phaseAfter: 'mini_clarity',
      },
      nodeTraces: [
        {
          node: 'extract_signals',
          status: 'failed',
          latencyMs: 10,
        },
      ],
      modelCalls: [
        {
          provider: 'gemini',
          model: 'gemini-2.5-flash-lite',
          totalTokens: 42,
        },
      ],
      selectedExpertIds: [],
      error: {
        node: 'extract_signals',
        message: 'Provider failed',
      },
    });

    expect(parsed.nodeTraces[0].node).toBe('extract_signals');
    expect(parsed.error.node).toBe('extract_signals');
  });

  it('allows service responses to expose the persisted graph run id', () => {
    const parsed = aiServiceMessageResponseSchema.parse({
      responseBlocks: [
        {
          type: 'reflection',
          content: 'You are weighing a real decision.',
        },
      ],
      stateUpdates: {
        phase: 'mini_clarity',
        depthMode: 'standard',
        signalSnapshot: {},
        memorySnapshot: {},
        readinessSnapshot: null,
      },
      signalUpdates: [],
      recommendationRun: null,
      memoryUpdates: [],
      traceMetadata: {
        graphRunId: '22222222-2222-2222-2222-222222222222',
      },
      persistedGraphRunId: '22222222-2222-2222-2222-222222222222',
      persistedRecommendationRunId: null,
    });

    expect(parsed.persistedGraphRunId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('validates resource card blocks in service responses', () => {
    const parsed = aiServiceMessageResponseSchema.parse({
      responseBlocks: [
        {
          type: 'resource_cards',
          resources: [
            {
              resourceId: '66666666-6666-6666-6666-666666666666',
              resourceType: 'course',
              title: 'Study Abroad Decision Planning',
              description: 'A public course.',
              href: '/courses/66666666-6666-6666-6666-666666666666',
              source: 'courses',
              visibility: 'public',
              tags: ['study abroad'],
              learningOutcomes: ['Compare options'],
              finalScore: 0.84,
            },
          ],
        },
      ],
      stateUpdates: {
        phase: 'mini_clarity',
        depthMode: 'standard',
        signalSnapshot: {},
        memorySnapshot: {},
        readinessSnapshot: null,
      },
      signalUpdates: [],
      recommendationRun: {
        algorithmVersion: 'infinity-resource-v1',
        candidateCount: 1,
        selectedCount: 1,
        traceMetadata: {
          runType: 'resources',
          selectedResources: [
            {
              resourceId: '66666666-6666-6666-6666-666666666666',
              resourceType: 'course',
            },
          ],
        },
        candidates: [],
      },
      memoryUpdates: [],
      traceMetadata: {},
      persistedGraphRunId: '22222222-2222-2222-2222-222222222222',
      persistedRecommendationRunId: '55555555-5555-5555-5555-555555555555',
    });

    expect(parsed.responseBlocks[0].type).toBe('resource_cards');
    expect(parsed.responseBlocks[0].resources?.[0].href).toBe(
      '/courses/66666666-6666-6666-6666-666666666666'
    );
    expect(parsed.recommendationRun?.traceMetadata.runType).toBe('resources');
  });

  it('parses a GoalWorkbench response through the service response schema', () => {
    const parsed = aiServiceMessageResponseSchema.parse({
      responseBlocks: [
        {
          type: 'reflection',
          content: 'You are exploring a London study-abroad goal with budget constraints.',
          suggestedReply: 'Please do',
        },
        {
          type: 'micro_consent',
          content: 'The model can turn this into a compact feasibility plan.',
          suggestedReply: 'Please do',
        },
      ],
      stateUpdates: {
        phase: 'mini_clarity',
        depthMode: 'light',
        signalSnapshot: {
          geography: ['London'],
          constraints: ['budget matters'],
          active_goal: {
            active_goal_key: 'goal-1',
            goal_type: 'study_abroad',
            goal_summary: 'Study abroad in London while managing budget constraints.',
            collected_fields: {
              geography: ['London'],
              constraints: ['budget matters'],
            },
            missing_fields: ['budget', 'study_level', 'subject_field', 'timeline'],
            next_action: 'collect concrete planning details',
            last_artifact_hash: 'hash-1',
            plan_version: 1,
          },
        },
        memorySnapshot: {},
        readinessSnapshot: null,
      },
      signalUpdates: [
        {
          signalType: 'geography',
          signalValue: 'London',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: 'London' }],
        },
        {
          signalType: 'constraint',
          signalValue: 'budget matters',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: 'budget matters' }],
        },
      ],
      recommendationRun: null,
      memoryUpdates: [],
      traceMetadata: {
        activeFlow: 'goal_companion',
        goalWorkbench: {
          route_decision: {
            target_flow: 'stay_goal_companion',
          },
        },
      },
      persistedGraphRunId: '22222222-2222-2222-2222-222222222222',
      persistedRecommendationRunId: null,
    });

    expect(parsed.responseBlocks.map((block) => block.type)).toEqual([
      'reflection',
      'micro_consent',
    ]);
    expect(parsed.responseBlocks[0].suggestedReply).toBe('Please do');
  });

  it('parses GoalWorkbench concrete planning signals for budget and study details', () => {
    const parsed = aiServiceMessageResponseSchema.parse({
      responseBlocks: [
        {
          type: 'reflection',
          content: 'You added 22 rupees, PhD, and Computer Science to the London study goal.',
        },
        {
          type: 'insight',
          content:
            'That budget is likely unrealistic for a London PhD path, so feasibility comes first.',
        },
      ],
      stateUpdates: {
        phase: 'mini_clarity',
        depthMode: 'light',
        signalSnapshot: {
          budget: {
            amount: 22,
            currency: 'INR',
            raw_budget_text: '22 rupees',
          },
          study_level: 'PhD',
          subject_field: 'Computer Science',
          geography: ['London'],
          constraints: ['budget matters'],
          feasibility_flags: ['budget_likely_unrealistic_for_london_phd'],
          active_goal: {
            active_goal_key: 'goal-1',
            goal_type: 'study_abroad',
            goal_summary:
              'Study abroad in London with a Computer Science PhD target and budget constraint.',
            collected_fields: {
              budget: {
                amount: 22,
                currency: 'INR',
                raw_budget_text: '22 rupees',
              },
              study_level: 'PhD',
              subject_field: 'Computer Science',
              geography: ['London'],
              constraints: ['budget matters'],
              feasibility_flags: ['budget_likely_unrealistic_for_london_phd'],
            },
            missing_fields: ['timeline', 'funding_source'],
            next_action: 'check feasibility before shortlisting programmes',
            last_artifact_hash: 'hash-2',
            plan_version: 2,
          },
        },
        memorySnapshot: {},
        readinessSnapshot: null,
      },
      signalUpdates: [
        {
          signalType: 'budget',
          signalValue: '22 rupees',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: '22 rupees' }],
        },
        {
          signalType: 'study_level',
          signalValue: 'PhD',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: 'PHD' }],
        },
        {
          signalType: 'subject_field',
          signalValue: 'Computer Science',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: 'Computer scientist' }],
        },
        {
          signalType: 'geography',
          signalValue: 'London',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench', excerpt: 'London' }],
        },
        {
          signalType: 'feasibility_flag',
          signalValue: 'budget_likely_unrealistic_for_london_phd',
          confidence: 0.86,
          evidence: [{ source: 'goal_workbench' }],
        },
      ],
      recommendationRun: null,
      memoryUpdates: [],
      traceMetadata: {
        activeFlow: 'goal_companion',
      },
      persistedGraphRunId: '22222222-2222-2222-2222-222222222222',
      persistedRecommendationRunId: null,
    });

    expect(parsed.signalUpdates.map((signal) => signal.signalType)).toEqual([
      'budget',
      'study_level',
      'subject_field',
      'geography',
      'feasibility_flag',
    ]);
    expect(parsed.stateUpdates.signalSnapshot.active_goal).toMatchObject({
      collected_fields: {
        budget: {
          raw_budget_text: '22 rupees',
        },
        study_level: 'PhD',
        subject_field: 'Computer Science',
      },
    });
  });

  it('unwraps nested FastAPI/platform errors before showing them to the UI', () => {
    const message = __infinityAiClientTest.extractServiceErrorMessage(
      JSON.stringify({
        detail: JSON.stringify({
          code: 'INFINITY_AI_GRAPH_SCHEMA_MISSING',
          error:
            'Infinity AI graph storage is not ready. Apply lib/db/migrations/0057_infinity_ai_graph_runs.sql to the connected database.',
        }),
      })
    );

    expect(message).toBe(
      'Infinity AI graph storage is not ready. Apply lib/db/migrations/0057_infinity_ai_graph_runs.sql to the connected database.'
    );
    expect(message).not.toContain('insert into');
  });
});
