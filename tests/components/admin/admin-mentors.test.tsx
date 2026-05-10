/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminMentors } from '@/components/admin/dashboard/admin-mentors';

vi.mock('@/hooks/queries/use-admin-queries', () => ({
  useAdminMentorsQuery: () => ({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: vi.fn(),
  }),
  useAdminMentorAuditQuery: () => ({
    data: null,
    isLoading: false,
  }),
  useAdminUpdateMentorMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useAdminSendMentorCouponMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe('AdminMentors', () => {
  it('renders the loading state without re-entering the toggle sync effect', () => {
    render(<AdminMentors />);

    expect(screen.getByText('Loading mentor applications...')).toBeInTheDocument();
  });
});
