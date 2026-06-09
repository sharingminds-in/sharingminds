'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { FeatureKey } from '@/lib/subscriptions/feature-keys';
import {
  getFeatureLimitCurrency,
  getNumericFeatureLimitAmount,
  hasIncludedFeature,
  type SubscriptionFeatureRecord,
} from '@/lib/subscriptions/client-access';
import { useTRPCClient } from '@/lib/trpc/react';
import type { RouterOutputs } from '@/lib/trpc/types';
import { queryKeys } from '@/lib/react-query';

export type SubscriptionAudience = 'mentor' | 'mentee';

type SelfSubscriptionResponse = RouterOutputs['subscriptions']['me'];
type SelfSubscriptionUsage = RouterOutputs['subscriptions']['usage'];
type PublicPlansResponse = RouterOutputs['subscriptions']['publicPlans'];

export type SubscriptionInfo = SelfSubscriptionResponse['subscription'];
export type SubscriptionFeature = SelfSubscriptionResponse['features'][number];
export type SubscriptionUsageEntry = SelfSubscriptionUsage[number];
export type PublicSubscriptionPlan = PublicPlansResponse[number];

export const subscriptionKeys = {
  all: ['subscription'] as const,
  me: (audience: SubscriptionAudience) =>
    [...subscriptionKeys.all, 'me', audience] as const,
  usage: (audience: SubscriptionAudience) =>
    [...subscriptionKeys.all, 'usage', audience] as const,
  publicPlans: (audience: SubscriptionAudience | null) =>
    [...subscriptionKeys.all, 'public-plans', audience ?? 'all'] as const,
};

async function invalidateSubscriptionQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await queryClient.invalidateQueries({
    queryKey: subscriptionKeys.all,
  });
}

export function useSubscriptionDetails(
  audience: SubscriptionAudience,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: subscriptionKeys.me(audience),
    queryFn: () => trpcClient.subscriptions.me.query({ audience }),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSubscriptionUsage(
  audience: SubscriptionAudience,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: subscriptionKeys.usage(audience),
    queryFn: () => trpcClient.subscriptions.usage.query({ audience }),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSelectSubscriptionPlanMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      planId: string;
      priceId?: string;
      status?: 'active' | 'trialing';
    }) => trpcClient.subscriptions.selectPlan.mutate(input),
    onSuccess: async () => {
      await invalidateSubscriptionQueries(queryClient);
      // Refresh session so mentorAccess/menteeAccess updates in auth context (sidebar locks)
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionWithRoles });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to select plan'
      );
    },
  });
}

export function usePublicSubscriptionPlans(
  audience?: SubscriptionAudience | null,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: subscriptionKeys.publicPlans(audience ?? null),
    queryFn: () =>
      trpcClient.subscriptions.publicPlans.query(
        audience ? { audience } : undefined
      ),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSubscriptionFeatureAccess(
  audience: SubscriptionAudience,
  featureKey: FeatureKey,
  enabled = true
) {
  const query = useSubscriptionDetails(audience, enabled);

  return {
    ...query,
    hasAccess: hasIncludedFeature(query.data?.features, featureKey),
  };
}

export function useSubscriptionFeatureLimitAmount(
  audience: SubscriptionAudience,
  featureKey: FeatureKey,
  enabled = true
) {
  const query = useSubscriptionDetails(audience, enabled);

  return {
    ...query,
    limitAmount: getNumericFeatureLimitAmount(query.data?.features, featureKey),
    limitCurrency: getFeatureLimitCurrency(query.data?.features, featureKey),
  };
}

export type { SubscriptionFeatureRecord };
