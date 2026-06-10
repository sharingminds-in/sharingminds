import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getSession, listUserMemoryItems } = vi.hoisted(() => ({
  getSession: vi.fn(),
  listUserMemoryItems: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

vi.mock('@/lib/infinity-ai/repository', () => ({
  listUserMemoryItems,
}));

import { GET } from '@/app/api/infinity-ai/memory/route';

describe('GET /api/infinity-ai/memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users before reading memory', async () => {
    getSession.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/infinity-ai/memory')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
    });
    expect(listUserMemoryItems).not.toHaveBeenCalled();
  });

  it('returns only current-user memory DTOs', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    listUserMemoryItems.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        userId: 'user-2',
        memoryType: 'goal',
        content: 'User wants a funded study-abroad plan.',
        confidence: 0.92,
        provenance: { traceId: 'internal-trace-id' },
        provenanceSummary: 'Source: conversation',
        conversationId: '22222222-2222-2222-2222-222222222222',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-02T10:00:00.000Z',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/infinity-ai/memory')
    );

    expect(response.status).toBe(200);
    expect(listUserMemoryItems).toHaveBeenCalledWith('user-1');

    const body = await response.json();
    expect(body).toEqual({
      memories: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          memoryType: 'goal',
          content: 'User wants a funded study-abroad plan.',
          confidence: 0.92,
          provenanceSummary: 'Source: conversation',
          conversationId: '22222222-2222-2222-2222-222222222222',
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-02T10:00:00.000Z',
        },
      ],
    });
    expect(body.memories[0]).not.toHaveProperty('userId');
    expect(body.memories[0]).not.toHaveProperty('provenance');
  });
});
