/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsers } from '@/components/admin/dashboard/admin-users';

const mocks = vi.hoisted(() => ({
  createAdmin: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  promoteAdmin: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  createMentor: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  listCountries: vi.fn().mockResolvedValue([]),
  listStates: vi.fn().mockResolvedValue([]),
  listCities: vi.fn().mockResolvedValue([]),
  refetchUsers: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  roles: [
    {
      name: 'admin',
      displayName: 'Admin',
      adminLevel: 'super',
    },
  ],
  session: {
    user: {
      id: 'admin-1',
    },
  },
}));

const trpcClientMock = vi.hoisted(() => ({
  public: {
    listCountries: {
      query: mocks.listCountries,
    },
    listStates: {
      query: mocks.listStates,
    },
    listCities: {
      query: mocks.listCities,
    },
  },
}));

vi.mock('@/lib/trpc/react', () => ({
  useTRPCClient: () => trpcClientMock,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authMock,
}));

vi.mock('@/hooks/queries/use-admin-queries', () => ({
  useAdminUsersQuery: () => ({
    data: [
      {
        id: 'admin-1',
        email: 'super@example.com',
        emailVerified: true,
        name: 'Super Admin',
        firstName: 'Super',
        lastName: 'Admin',
        phone: null,
        isActive: true,
        isBlocked: false,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        roles: [
          {
            name: 'admin',
            displayName: 'Admin',
            adminLevel: 'super',
          },
        ],
        mentor: null,
      },
      {
        id: 'admin-2',
        email: 'normal@example.com',
        emailVerified: true,
        name: 'Normal Admin',
        firstName: 'Normal',
        lastName: 'Admin',
        phone: null,
        isActive: true,
        isBlocked: false,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        roles: [
          {
            name: 'admin',
            displayName: 'Admin',
            adminLevel: 'normal',
          },
        ],
        mentor: null,
      },
    ],
    isLoading: false,
    error: null,
    refetch: mocks.refetchUsers,
  }),
  useAdminCreateMentorUserMutation: () => mocks.createMentor,
  useAdminCreateAdminUserMutation: () => mocks.createAdmin,
  useAdminPromoteAdminUserMutation: () => mocks.promoteAdmin,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminUsers', () => {
  beforeEach(() => {
    authMock.roles = [
      {
        name: 'admin',
        displayName: 'Admin',
        adminLevel: 'super',
      },
    ];
    mocks.createAdmin.mutateAsync.mockReset();
    mocks.createAdmin.isPending = false;
    mocks.promoteAdmin.mutateAsync.mockReset();
    mocks.promoteAdmin.isPending = false;
    mocks.createMentor.mutateAsync.mockReset();
    mocks.createMentor.isPending = false;
    mocks.listCountries.mockClear();
    mocks.listStates.mockClear();
    mocks.listCities.mockClear();
    mocks.refetchUsers.mockReset();
  });

  it('renders admin counts and the admin level column', async () => {
    render(<AdminUsers />);

    await waitFor(() => {
      expect(mocks.listCountries).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Admins')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Admin level' })
    ).toBeInTheDocument();
    expect(screen.getByText('Super admin')).toBeInTheDocument();
    expect(screen.getByText('Normal admin')).toBeInTheDocument();
  });

  it('submits the add-admin dialog with normal admin as the default level', async () => {
    const user = userEvent.setup();
    mocks.createAdmin.mutateAsync.mockResolvedValue({ success: true });

    render(<AdminUsers />);

    await user.click(screen.getByRole('button', { name: /add admin/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Grace Hopper');
    await user.type(screen.getByLabelText(/^email/i), 'grace@example.com');
    await user.type(
      screen.getByLabelText(/initial password/i),
      'admin123'
    );
    await user.click(screen.getByRole('button', { name: /create admin/i }));

    await waitFor(() => {
      expect(mocks.createAdmin.mutateAsync).toHaveBeenCalledWith({
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        initialPassword: 'admin123',
        adminLevel: 'normal',
      });
    });
  });

  it('lets a super admin promote a normal admin to super', async () => {
    const user = userEvent.setup();
    mocks.promoteAdmin.mutateAsync.mockResolvedValue({ success: true });

    render(<AdminUsers />);

    await user.click(
      screen.getByRole('button', {
        name: /promote normal admin to super admin/i,
      })
    );
    await user.click(
      screen.getByRole('button', {
        name: /confirm promotion/i,
      })
    );

    await waitFor(() => {
      expect(mocks.promoteAdmin.mutateAsync).toHaveBeenCalledWith({
        userId: 'admin-2',
      });
    });
  });

  it('hides the promotion action from normal admins', async () => {
    authMock.roles = [
      {
        name: 'admin',
        displayName: 'Admin',
        adminLevel: 'normal',
      },
    ];

    render(<AdminUsers />);

    await waitFor(() => {
      expect(mocks.listCountries).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.queryByRole('button', {
        name: /promote normal admin to super admin/i,
      })
    ).not.toBeInTheDocument();
  });
});
