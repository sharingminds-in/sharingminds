import { describe, expect, it } from 'vitest';

import { buildAccountAccessPolicySnapshot } from '@/lib/access-policy/account';
import {
  buildMenteeAccessPolicySnapshot,
  getMenteeDashboardSectionFeature,
  getMenteeFeatureDecision,
  mergeMenteePolicyConfig,
  MENTEE_FEATURE_KEYS,
} from '@/lib/mentee/access-policy';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import type { SubscriptionEntitlementSnapshot } from '@/lib/subscriptions/entitlement-snapshot';
import type { SubscriptionPlanFeature } from '@/lib/subscriptions/enforcement';

function createPlanFeature(featureKey: string): SubscriptionPlanFeature {
  return {
    feature_key: featureKey,
    feature_name: featureKey,
    is_included: true,
    value_type: 'boolean',
    unit: null,
    limit_count: null,
    limit_minutes: null,
    limit_text: null,
    limit_amount: null,
    limit_percent: null,
    limit_json: null,
    limit_interval: null,
    limit_interval_count: 1,
    is_metered: false,
  };
}

function createSubscriptionSnapshot(
  state: SubscriptionEntitlementSnapshot['state'],
  featureKeys: string[] = []
): SubscriptionEntitlementSnapshot {
  const features = featureKeys.map(createPlanFeature);

  return {
    audience: 'mentee',
    state,
    hasSubscription: state === 'loaded',
    features,
    featureRecords: features.map((feature) => ({
      feature_key: feature.feature_key,
      is_included: feature.is_included,
      limit_amount: feature.limit_amount,
    })),
    errorMessage: state === 'missing' ? 'No active mentee subscription' : null,
  };
}

const activeAccount = buildAccountAccessPolicySnapshot({
  isAuthenticated: true,
  isActive: true,
  isBlocked: false,
});

describe('mentee access policy', () => {
  it('allows subscription-backed mentee features when entitlements are present', () => {
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: activeAccount,
      subscription: createSubscriptionSnapshot('loaded', [
        FEATURE_KEYS.COURSES_ACCESS,
        FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
        FEATURE_KEYS.SESSION_RECORDINGS_ACCESS,
        FEATURE_KEYS.AI_HELPER_CHAT_ACCESS,
        FEATURE_KEYS.DIRECT_MESSAGES_DAILY,
        FEATURE_KEYS.MESSAGE_REQUESTS_DAILY,
      ]),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.allowed
    ).toBe(true);
    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.analyticsView)
        ?.allowed
    ).toBe(true);
    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.aiChatUse)?.allowed
    ).toBe(true);
  });

  it('blocks subscription-backed features when no mentee subscription exists', () => {
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: activeAccount,
      subscription: createSubscriptionSnapshot('missing'),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.reasonCode
    ).toBe('subscription_required');
    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.messagesView)?.allowed
    ).toBe(true);
  });

  it('blocks mentee features for restricted accounts', () => {
    const blockedAccount = buildAccountAccessPolicySnapshot({
      isAuthenticated: true,
      isActive: true,
      isBlocked: true,
    });
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: blockedAccount,
      subscription: createSubscriptionSnapshot('loaded', [
        FEATURE_KEYS.COURSES_ACCESS,
      ]),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.messagesView)
        ?.reasonCode
    ).toBe('account_blocked');
  });

  it('blocks mentee features for inactive accounts before subscription rules', () => {
    const inactiveAccount = buildAccountAccessPolicySnapshot({
      isAuthenticated: true,
      isActive: false,
      isBlocked: false,
    });
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: inactiveAccount,
      subscription: createSubscriptionSnapshot('loaded', [
        FEATURE_KEYS.COURSES_ACCESS,
      ]),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.reasonCode
    ).toBe('account_inactive');
  });

  it('marks mentee subscription-backed features as unavailable when entitlements cannot be resolved', () => {
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: activeAccount,
      subscription: createSubscriptionSnapshot('unavailable'),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.reasonCode
    ).toBe('subscription_unavailable');
  });

  it('allows admin overrides even without a mentee role', () => {
    const policy = buildMenteeAccessPolicySnapshot({
      isAdmin: true,
      isMentee: false,
      accountAccess: activeAccount,
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.mentorDirectoryView)
        ?.allowed
    ).toBe(true);
    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.allowed
    ).toBe(true);
  });

  it('allows constrained runtime config overrides for inactive mentee subscription access', () => {
    const inactiveAccount = buildAccountAccessPolicySnapshot({
      isAuthenticated: true,
      isActive: false,
      isBlocked: false,
    });
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: inactiveAccount,
      subscription: createSubscriptionSnapshot('loaded'),
      policyConfig: mergeMenteePolicyConfig({
        features: {
          [MENTEE_FEATURE_KEYS.subscriptionManage]: {
            account: {
              inactive: 'ok',
            },
          },
        },
      }),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.subscriptionManage)
        ?.allowed
    ).toBe(true);
  });

  it('allows constrained runtime config overrides for missing-subscription learning access', () => {
    const policy = buildMenteeAccessPolicySnapshot({
      isMentee: true,
      accountAccess: activeAccount,
      subscription: createSubscriptionSnapshot('missing'),
      policyConfig: mergeMenteePolicyConfig({
        features: {
          [MENTEE_FEATURE_KEYS.learningWorkspace]: {
            subscription: {
              missing: 'ok',
            },
          },
        },
      }),
    });

    expect(
      getMenteeFeatureDecision(policy, MENTEE_FEATURE_KEYS.learningWorkspace)
        ?.allowed
    ).toBe(true);
  });

  it('maps dashboard sections to centralized mentee features', () => {
    expect(getMenteeDashboardSectionFeature('my-courses')).toBe(
      MENTEE_FEATURE_KEYS.learningWorkspace
    );
    expect(getMenteeDashboardSectionFeature('chat')).toBe(
      MENTEE_FEATURE_KEYS.aiChatUse
    );
    expect(getMenteeDashboardSectionFeature('subscription')).toBe(
      MENTEE_FEATURE_KEYS.subscriptionManage
    );
  });
});
