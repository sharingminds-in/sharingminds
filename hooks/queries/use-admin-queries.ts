import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTRPCClient } from '@/lib/trpc/react';
import type { RouterInputs, RouterOutputs } from '@/lib/trpc/types';

export type AdminOverviewData = RouterOutputs['admin']['overview'];
export type AdminMentorItem = RouterOutputs['admin']['listMentors'][number];
export type AdminUserItem = RouterOutputs['admin']['listUsers'][number];
export type AdminMenteeItem = RouterOutputs['admin']['listMentees'][number];
export type AdminEnquiryItem = RouterOutputs['admin']['listEnquiries'][number];
export type AdminPolicyRecord = RouterOutputs['admin']['getPolicies']['policies'][number];
export type GroupedAdminPolicies = RouterOutputs['admin']['getPolicies']['grouped'];
export type AdminMentorAudit = RouterOutputs['admin']['getMentorAudit'];
export type AdminMentorPricingHistory =
  RouterOutputs['admin']['getMentorPricingHistory'];
export type AdminUpdateMentorInput = Exclude<
  RouterInputs['admin']['updateMentor'],
  void
>;
export interface AdminUpdateMentorPricingInput {
  mentorId: string;
  adminHourlyRateOverride: number | null;
  reason?: string | null;
}
export type AdminCreateMentorUserInput =
  RouterInputs['admin']['createMentorUser'];
export type AdminCreateAdminUserInput =
  RouterInputs['admin']['createAdminUser'];
export type AdminPromoteAdminUserInput =
  RouterInputs['admin']['promoteAdminUser'];
export type AdminAccessPolicyConfig =
  RouterOutputs['admin']['getAccessPolicyConfig'];
export type AdminAccessPolicyDraftInput = Exclude<
  RouterInputs['admin']['upsertAccessPolicyDraft'],
  void
>;
export type AdminAccessPolicyOverrides =
  AdminAccessPolicyDraftInput['overrides'];

export const adminKeys = {
  all: ['admin'] as const,
  overview: () => ['admin', 'overview'] as const,
  mentors: () => ['admin', 'mentors'] as const,
  users: () => ['admin', 'users'] as const,
  mentorAudit: (mentorId: string) => ['admin', 'mentor-audit', mentorId] as const,
  mentorPricingHistory: (mentorId: string) =>
    ['admin', 'mentor-pricing-history', mentorId] as const,
  mentees: () => ['admin', 'mentees'] as const,
  enquiries: () => ['admin', 'enquiries'] as const,
  policies: () => ['admin', 'policies'] as const,
  accessPolicyConfig: () => ['admin', 'access-policy-config'] as const,
};

async function invalidateAdminQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  mentorId?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    mentorId
      ? Promise.all([
          queryClient.invalidateQueries({
            queryKey: adminKeys.mentorAudit(mentorId),
          }),
          queryClient.invalidateQueries({
            queryKey: adminKeys.mentorPricingHistory(mentorId),
          }),
        ])
      : Promise.resolve(),
  ]);
}

export function useAdminOverviewQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: () => trpcClient.admin.overview.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminMentorsQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.mentors(),
    queryFn: () => trpcClient.admin.listMentors.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminUsersQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: () => trpcClient.admin.listUsers.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminMentorAuditQuery(mentorId: string | null | undefined) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.mentorAudit(mentorId!),
    queryFn: () =>
      trpcClient.admin.getMentorAudit.query({
        mentorId: mentorId!,
      }),
    enabled: Boolean(mentorId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminMentorPricingHistoryQuery(
  mentorId: string | null | undefined
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.mentorPricingHistory(mentorId!),
    queryFn: () =>
      trpcClient.admin.getMentorPricingHistory.query({
        mentorId: mentorId!,
      }),
    enabled: Boolean(mentorId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminMenteesQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.mentees(),
    queryFn: () => trpcClient.admin.listMentees.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminEnquiriesQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.enquiries(),
    queryFn: () => trpcClient.admin.listEnquiries.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminPoliciesQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.policies(),
    queryFn: () => trpcClient.admin.getPolicies.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminAccessPolicyConfigQuery() {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminKeys.accessPolicyConfig(),
    queryFn: () => trpcClient.admin.getAccessPolicyConfig.query(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminUpdateMentorMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminUpdateMentorInput) =>
      trpcClient.admin.updateMentor.mutate(input),
    onSuccess: async (_result, variables) => {
      await invalidateAdminQueries(queryClient, variables.mentorId);
    },
  });
}

export function useAdminUpdateMentorPricingMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminUpdateMentorPricingInput) =>
      trpcClient.admin.updateMentorPricing.mutate(input),
    onSuccess: async (_result, variables) => {
      await invalidateAdminQueries(queryClient, variables.mentorId);
    },
  });
}

export function useAdminCreateMentorUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FormData) => {
      const response = await fetch('/api/admin/mentors', {
        method: 'POST',
        body: input,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? 'Failed to create mentor user');
      }

      return result;
    },
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminCreateAdminUserMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateAdminUserInput) =>
      trpcClient.admin.createAdminUser.mutate(input),
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminPromoteAdminUserMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminPromoteAdminUserInput) =>
      trpcClient.admin.promoteAdminUser.mutate(input),
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminSendMentorCouponMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { mentorId: string }) =>
      trpcClient.admin.sendMentorCoupon.mutate(input),
    onSuccess: async (_result, variables) => {
      await invalidateAdminQueries(queryClient, variables.mentorId);
    },
  });
}

export function useAdminUpdateEnquiryMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { enquiryId: string; isResolved: boolean }) =>
      trpcClient.admin.updateEnquiry.mutate(input),
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminUpdatePoliciesMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { updates: Array<{ key: string; value: string }> }) =>
      trpcClient.admin.updatePolicies.mutate(input),
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminResetPoliciesMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => trpcClient.admin.resetPolicies.mutate(),
    onSuccess: async () => {
      await invalidateAdminQueries(queryClient);
    },
  });
}

export function useAdminUpsertAccessPolicyDraftMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminAccessPolicyDraftInput) =>
      trpcClient.admin.upsertAccessPolicyDraft.mutate(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.accessPolicyConfig() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      ]);
    },
  });
}

export function useAdminPublishAccessPolicyDraftMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => trpcClient.admin.publishAccessPolicyDraft.mutate(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.accessPolicyConfig() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      ]);
    },
  });
}

export function useAdminResetAccessPolicyDraftMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: RouterInputs['admin']['resetAccessPolicyDraft']) =>
      trpcClient.admin.resetAccessPolicyDraft.mutate(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.accessPolicyConfig() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      ]);
    },
  });
}
