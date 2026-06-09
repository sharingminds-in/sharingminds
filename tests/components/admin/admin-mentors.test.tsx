/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminMentors } from '@/components/admin/dashboard/admin-mentors';

const queryState = vi.hoisted(() => ({
  data: undefined as unknown[] | undefined,
  isLoading: true,
}));

vi.mock(
  '@/components/admin/dashboard/admin-direct-message-dialog',
  () => ({
    AdminDirectMessageDialog: () => null,
  }),
);

vi.mock('@/hooks/queries/use-admin-queries', () => ({
  useAdminMentorsQuery: () => ({
    data: queryState.data,
    isLoading: queryState.isLoading,
    error: null,
    refetch: vi.fn(),
  }),
  useAdminMentorAuditQuery: () => ({
    data: null,
    isLoading: false,
  }),
  useAdminMentorPricingHistoryQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
  useAdminUpdateMentorMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useAdminUpdateMentorPricingMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminSendMentorCouponMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe('AdminMentors', () => {
  beforeEach(() => {
    queryState.data = undefined;
    queryState.isLoading = true;
  });

  it('renders the loading state without re-entering the toggle sync effect', () => {
    render(<AdminMentors />);

    expect(screen.getByText('Loading mentor applications...')).toBeInTheDocument();
  });

  it('filters mentors using the directory search field', () => {
    queryState.data = [
      {
        id: 'mentor-1',
        userId: 'user-1',
        name: 'Ada Lovelace',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        expertise: ['Data Engineering'],
        verificationStatus: 'IN_PROGRESS',
      },
      {
        id: 'mentor-2',
        userId: 'user-2',
        name: 'Grace Hopper',
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        expertise: ['Compiler Design'],
        verificationStatus: 'IN_PROGRESS',
      },
    ];
    queryState.isLoading = false;

    render(<AdminMentors />);

    const search = screen.getByPlaceholderText(
      'Search by name, email, expertise...',
    );
    fireEvent.change(search, { target: { value: 'compiler' } });

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });
});
