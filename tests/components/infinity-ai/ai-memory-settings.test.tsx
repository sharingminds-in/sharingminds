/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiMemorySettings } from '@/components/infinity-ai/AiMemorySettings';

function mockFetchJson(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    })
  );
}

function mockFetchSequence(
  responses: Array<{ body: unknown; status?: number }>
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const next = responses.shift();

      if (!next) {
        throw new Error('Unexpected fetch call');
      }

      const status = next.status ?? 200;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(next.body),
      });
    })
  );
}

describe('AiMemorySettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the empty state when authenticated memory has not been saved yet', async () => {
    mockFetchJson({ memories: [] });

    render(<AiMemorySettings />);

    await waitFor(() => {
      expect(screen.getByText('No saved memory yet')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Memories' })).toBeInTheDocument();
    expect(
      screen.getByText('Memory appears here after authenticated Infinity AI conversations.')
    ).toBeInTheDocument();
  });

  it('renders saved memory without raw provenance details', async () => {
    mockFetchJson({
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

    render(<AiMemorySettings />);

    await waitFor(() => {
      expect(
        screen.getByText('User wants a funded study-abroad plan.')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
    expect(screen.getByText('Source: conversation')).toBeInTheDocument();
    expect(screen.queryByText('internal-trace-id')).not.toBeInTheDocument();
  });

  it('clears one memory item after server confirmation', async () => {
    mockFetchSequence([
      {
        body: {
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
        },
      },
      {
        body: { success: true },
      },
    ]);

    render(<AiMemorySettings />);

    await waitFor(() => {
      expect(
        screen.getByText('User wants a funded study-abroad plan.')
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /clear memory/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('User wants a funded study-abroad plan.')
      ).not.toBeInTheDocument();
    });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/infinity-ai/memory/11111111-1111-1111-1111-111111111111',
      { method: 'DELETE' }
    );
  });
});
