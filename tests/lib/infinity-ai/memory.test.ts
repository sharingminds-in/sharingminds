import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  delete: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
}));

const ormMocks = vi.hoisted(() => ({
  and: vi.fn(),
  eq: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMocks.select,
    delete: dbMocks.delete,
  },
}));

vi.mock('@/lib/db/schema', () => {
  const table = {};

  return {
    aiConversations: table,
    aiGraphRuns: table,
    aiMemoryItems: {
      id: 'ai_memory_items.id',
      userId: 'ai_memory_items.user_id',
      updatedAt: 'ai_memory_items.updated_at',
    },
    aiRecommendationCandidates: table,
    aiRecommendationEvents: table,
    aiRecommendationRuns: table,
    aiTurns: table,
    aiUserSignals: table,
    sessions: table,
  };
});

vi.mock('drizzle-orm', () => ({
  and: ormMocks.and,
  desc: ormMocks.desc,
  eq: ormMocks.eq,
  inArray: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

import { deleteUserMemoryItem, listUserMemoryItems } from '@/lib/infinity-ai/repository';

describe('Infinity AI user memory repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockReturnValue({ from: dbMocks.from });
    dbMocks.delete.mockReturnValue({ where: dbMocks.where });
    dbMocks.from.mockReturnValue({ where: dbMocks.where });
    dbMocks.where.mockReturnValue({ orderBy: dbMocks.orderBy, returning: dbMocks.returning });
    dbMocks.orderBy.mockReturnValue({ limit: dbMocks.limit });
    ormMocks.and.mockImplementation((...conditions) => ({ conditions }));
    ormMocks.eq.mockImplementation((column, value) => ({ column, value }));
    ormMocks.desc.mockImplementation((column) => ({ desc: column }));
  });

  it('filters memory rows by owner and returns sanitized DTOs', async () => {
    dbMocks.limit.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        userId: 'user-1',
        conversationId: '22222222-2222-2222-2222-222222222222',
        memoryType: 'goal',
        content: 'User wants a funded study-abroad plan.',
        confidence: '0.875',
        provenance: {
          source: 'conversation',
          phase: 'discovery',
          traceId: 'internal-trace-id',
        },
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        updatedAt: new Date('2026-06-02T10:00:00.000Z'),
      },
    ]);

    const memories = await listUserMemoryItems('user-1', 20);

    expect(ormMocks.eq).toHaveBeenCalledWith('ai_memory_items.user_id', 'user-1');
    expect(dbMocks.limit).toHaveBeenCalledWith(20);
    expect(memories).toEqual([
      {
        id: '11111111-1111-1111-1111-111111111111',
        memoryType: 'goal',
        content: 'User wants a funded study-abroad plan.',
        confidence: 0.875,
        provenanceSummary:
          'Source: conversation · Phase: discovery · Conversation: 22222222-2222-2222-2222-222222222222',
        conversationId: '22222222-2222-2222-2222-222222222222',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-02T10:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(memories)).not.toContain('internal-trace-id');
  });

  it('deletes memory only when id and owner match', async () => {
    dbMocks.returning.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111' },
    ]);

    const deleted = await deleteUserMemoryItem(
      'user-1',
      '11111111-1111-1111-1111-111111111111'
    );

    expect(deleted).toBe(true);
    expect(ormMocks.eq).toHaveBeenCalledWith(
      'ai_memory_items.id',
      '11111111-1111-1111-1111-111111111111'
    );
    expect(ormMocks.eq).toHaveBeenCalledWith('ai_memory_items.user_id', 'user-1');
    expect(ormMocks.and).toHaveBeenCalledWith(
      {
        column: 'ai_memory_items.id',
        value: '11111111-1111-1111-1111-111111111111',
      },
      { column: 'ai_memory_items.user_id', value: 'user-1' }
    );
  });

  it('returns false when no owned memory row is deleted', async () => {
    dbMocks.returning.mockResolvedValue([]);

    await expect(
      deleteUserMemoryItem('user-1', '11111111-1111-1111-1111-111111111111')
    ).resolves.toBe(false);
  });
});
