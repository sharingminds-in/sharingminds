import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getSession, deleteUserMemoryItem } = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteUserMemoryItem: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

vi.mock('@/lib/infinity-ai/repository', () => ({
  deleteUserMemoryItem,
}));

import { DELETE } from '@/app/api/infinity-ai/memory/[memoryId]/route';

function request() {
  return new NextRequest(
    'http://localhost:3000/api/infinity-ai/memory/11111111-1111-1111-1111-111111111111'
  );
}

function params(memoryId = '11111111-1111-1111-1111-111111111111') {
  return { params: Promise.resolve({ memoryId }) };
}

describe('DELETE /api/infinity-ai/memory/:memoryId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users before deleting memory', async () => {
    getSession.mockResolvedValue(null);

    const response = await DELETE(request(), params());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
    });
    expect(deleteUserMemoryItem).not.toHaveBeenCalled();
  });

  it('deletes only through the authenticated owner scope', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    deleteUserMemoryItem.mockResolvedValue(true);

    const response = await DELETE(request(), params());

    expect(response.status).toBe(200);
    expect(deleteUserMemoryItem).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-1111-1111-111111111111'
    );
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('does not report success for missing or non-owned memory', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    deleteUserMemoryItem.mockResolvedValue(false);

    const response = await DELETE(request(), params());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Memory not found',
    });
  });
});
