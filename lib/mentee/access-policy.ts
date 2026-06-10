import type { FeatureKey } from '@/lib/subscriptions/feature-keys';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import type { DashboardSectionKey } from '@/lib/dashboard/sections';
import type {
  AccountAccessPolicySnapshot,
  AccountAccessReasonCode,
  AccountLifecycleStatus,
} from '@/lib/access-policy/account';
import {
  hasSubscriptionEntitlement,
  type SubscriptionEntitlementSnapshot,
} from '@/lib/subscriptions/entitlement-snapshot';

export const MENTEE_FEATURE_KEYS = {
  mentorDirectoryView: 'mentor-directory.view',
  coursesBrowse: 'courses.browse',
  learningWorkspace: 'learning.workspace',
  analyticsView: 'analytics.view',
  messagesView: 'messages.view',
  directMessages: 'messages.direct',
  messageRequests: 'messages.requests',
  recordingsView: 'recordings.view',
  aiChatUse: 'ai.chat.use',
  sessionsView: 'sessions.view',
  profileManage: 'profile.manage',
  subscriptionManage: 'subscription.manage',
} as const;

export type MenteeFeatureKey =
  (typeof MENTEE_FEATURE_KEYS)[keyof typeof MENTEE_FEATURE_KEYS];

export const MENTEE_OVERRIDE_SCOPES = {
  all: 'all',
  account: 'account',
  subscription: 'subscription',
} as const;

export type MenteeOverrideScope =
  (typeof MENTEE_OVERRIDE_SCOPES)[keyof typeof MENTEE_OVERRIDE_SCOPES];

export type MenteeAccessMode = 'full' | 'blocked';

export type MenteeAccessReasonCode =
  | 'ok'
  | 'mentee_role_required'
  | AccountAccessReasonCode
  | 'subscription_required'
  | 'feature_not_in_plan'
  | 'subscription_unavailable';

export type MenteeAccountPolicyRuleCode = AccountAccessReasonCode;

export type MenteeSubscriptionPolicyState =
  | 'missing'
  | 'notInPlan'
  | 'unavailable';

export const MENTEE_SUBSCRIPTION_POLICY_STATES = [
  'missing',
  'notInPlan',
  'unavailable',
] as const satisfies readonly MenteeSubscriptionPolicyState[];

export type MenteeSubscriptionPolicyRuleCode =
  | 'ok'
  | 'subscription_required'
  | 'feature_not_in_plan'
  | 'subscription_unavailable';

export const MENTEE_SUBSCRIPTION_POLICY_RULE_CODES = [
  'ok',
  'subscription_required',
  'feature_not_in_plan',
  'subscription_unavailable',
] as const satisfies readonly MenteeSubscriptionPolicyRuleCode[];

export interface MenteeFeaturePolicyMatrix {
  account: Partial<
    Record<Extract<AccountLifecycleStatus, 'anonymous' | 'inactive' | 'blocked' | 'unavailable'>, MenteeAccountPolicyRuleCode>
  >;
  subscription?: Partial<
    Record<MenteeSubscriptionPolicyState, MenteeSubscriptionPolicyRuleCode>
  >;
}

export interface MenteeFeaturePolicyMatrixOverrides {
  account?: MenteeFeaturePolicyMatrix['account'];
  subscription?: MenteeFeaturePolicyMatrix['subscription'];
}

export interface MenteePolicyConfig {
  features: Record<MenteeFeatureKey, MenteeFeaturePolicyMatrix>;
}

export interface MenteePolicyConfigOverrides {
  features?: Partial<Record<MenteeFeatureKey, MenteeFeaturePolicyMatrixOverrides>>;
}

export interface MenteeFeatureDefinition {
  key: MenteeFeatureKey;
  label: string;
  blockedSummary: string;
  capabilities: string[];
  subscriptionFeatureKey?: FeatureKey;
}

export interface MenteeFeatureAccessDecision {
  key: MenteeFeatureKey;
  label: string;
  mode: MenteeAccessMode;
  allowed: boolean;
  reasonCode: MenteeAccessReasonCode;
  blockedSummary: string;
  capabilities: string[];
  subscriptionFeatureKey: FeatureKey | null;
  hasSubscriptionEntitlement: boolean | null;
}

export interface MenteeAccessContext {
  isMentee?: boolean;
  isAdmin?: boolean;
  accountAccess?: AccountAccessPolicySnapshot | null;
  subscription?: SubscriptionEntitlementSnapshot | null;
  overrideScopes?: readonly MenteeOverrideScope[] | null;
  policyConfig?: MenteePolicyConfig | null;
}

export interface MenteeAccessPolicySnapshot {
  isMentee: boolean;
  isAdmin: boolean;
  hasActiveSubscription: boolean;
  hasRestrictedFeatures: boolean;
  restrictedReasonCodes: MenteeAccessReasonCode[];
  features: Record<MenteeFeatureKey, MenteeFeatureAccessDecision>;
}

export const MENTEE_FEATURE_DEFINITIONS: Record<
  MenteeFeatureKey,
  MenteeFeatureDefinition
> = {
  [MENTEE_FEATURE_KEYS.mentorDirectoryView]: {
    key: MENTEE_FEATURE_KEYS.mentorDirectoryView,
    label: 'Mentor discovery',
    blockedSummary: 'Mentor discovery is unavailable right now.',
    capabilities: [
      'Browse mentors and explore their public profiles',
      'Compare expertise, pricing, and availability',
      'Start the mentor selection flow from one place',
    ],
  },
  [MENTEE_FEATURE_KEYS.coursesBrowse]: {
    key: MENTEE_FEATURE_KEYS.coursesBrowse,
    label: 'Course catalog',
    blockedSummary: 'The course catalog is unavailable right now.',
    capabilities: [
      'Browse available courses and course metadata',
      'Review curriculum, instructors, and pricing before enrollment',
      'Prepare learning decisions from the dashboard workspace',
    ],
  },
  [MENTEE_FEATURE_KEYS.learningWorkspace]: {
    key: MENTEE_FEATURE_KEYS.learningWorkspace,
    label: 'Learning workspace',
    blockedSummary:
      'Learning workspace access depends on your mentee subscription.',
    capabilities: [
      'Open enrolled courses and track learning progress',
      'Resume saved coursework and certificates',
      'Access your learning hub from a single place',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.COURSES_ACCESS,
  },
  [MENTEE_FEATURE_KEYS.analyticsView]: {
    key: MENTEE_FEATURE_KEYS.analyticsView,
    label: 'Learning analytics',
    blockedSummary:
      'Learning analytics depend on your mentee subscription.',
    capabilities: [
      'Track streaks, recommendations, and study consistency',
      'Review progress metrics across enrolled courses',
      'Unlock deeper insight into learning outcomes',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
  },
  [MENTEE_FEATURE_KEYS.messagesView]: {
    key: MENTEE_FEATURE_KEYS.messagesView,
    label: 'Messages',
    blockedSummary: 'Messages are unavailable right now.',
    capabilities: [
      'Review your message threads and ongoing conversations',
      'Stay up to date on mentorship communication',
      'Use the workspace inbox from one place',
    ],
  },
  [MENTEE_FEATURE_KEYS.directMessages]: {
    key: MENTEE_FEATURE_KEYS.directMessages,
    label: 'Direct messaging',
    blockedSummary:
      'Direct messaging depends on your mentee subscription.',
    capabilities: [
      'Send direct messages from approved conversations',
      'Use subscription-backed messaging capacity',
      'Continue mentor discussions from active threads',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.DIRECT_MESSAGES_DAILY,
  },
  [MENTEE_FEATURE_KEYS.messageRequests]: {
    key: MENTEE_FEATURE_KEYS.messageRequests,
    label: 'Message requests',
    blockedSummary:
      'Message requests depend on your mentee subscription.',
    capabilities: [
      'Start new mentor conversations with request workflows',
      'Use request quotas defined by your plan',
      'Reach new mentors without bypassing messaging policy',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.MESSAGE_REQUESTS_DAILY,
  },
  [MENTEE_FEATURE_KEYS.recordingsView]: {
    key: MENTEE_FEATURE_KEYS.recordingsView,
    label: 'Session recordings',
    blockedSummary:
      'Session recording access depends on your mentee subscription.',
    capabilities: [
      'Replay recorded mentorship sessions',
      'Access recordings from completed sessions',
      'Review past sessions without exposing unrestricted media',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.SESSION_RECORDINGS_ACCESS,
  },
  [MENTEE_FEATURE_KEYS.aiChatUse]: {
    key: MENTEE_FEATURE_KEYS.aiChatUse,
    label: 'AI chat',
    blockedSummary: 'AI chat depends on your mentee subscription.',
    capabilities: [
      'Use the AI helper workspace for guided questions',
      'Unlock chat capabilities defined by your plan',
      'Keep AI interactions aligned with subscription policy',
    ],
    subscriptionFeatureKey: FEATURE_KEYS.AI_HELPER_CHAT_ACCESS,
  },
  [MENTEE_FEATURE_KEYS.sessionsView]: {
    key: MENTEE_FEATURE_KEYS.sessionsView,
    label: 'Sessions',
    blockedSummary: 'Session access is unavailable right now.',
    capabilities: [
      'Review upcoming and past session activity',
      'Open booking and scheduling flows tied to your account',
      'Keep mentorship operations visible in the dashboard',
    ],
  },
  [MENTEE_FEATURE_KEYS.profileManage]: {
    key: MENTEE_FEATURE_KEYS.profileManage,
    label: 'Profile management',
    blockedSummary: 'Profile management is unavailable right now.',
    capabilities: [
      'Update your mentee profile and preferences',
      'Keep goals and learning interests current',
      'Manage personal account details from the workspace',
    ],
  },
  [MENTEE_FEATURE_KEYS.subscriptionManage]: {
    key: MENTEE_FEATURE_KEYS.subscriptionManage,
    label: 'Subscription management',
    blockedSummary: 'Subscription management is unavailable right now.',
    capabilities: [
      'Review your current plan and included features',
      'Upgrade or change mentee subscription coverage',
      'Manage billing and feature access settings',
    ],
  },
};

const DEFAULT_MENTEE_ACCOUNT_POLICY: MenteeFeaturePolicyMatrix['account'] = {
  anonymous: 'authentication_required',
  inactive: 'account_inactive',
  blocked: 'account_blocked',
  unavailable: 'account_state_unavailable',
};

function buildDefaultMenteeSubscriptionPolicy(
  definition: MenteeFeatureDefinition
): MenteeFeaturePolicyMatrix['subscription'] {
  if (!definition.subscriptionFeatureKey) {
    return undefined;
  }

  return {
    missing: 'subscription_required',
    notInPlan: 'feature_not_in_plan',
    unavailable: 'subscription_unavailable',
  };
}

function buildDefaultMenteeFeaturePolicyMatrix(
  definition: MenteeFeatureDefinition
): MenteeFeaturePolicyMatrix {
  return {
    account: DEFAULT_MENTEE_ACCOUNT_POLICY,
    subscription: buildDefaultMenteeSubscriptionPolicy(definition),
  };
}

export const DEFAULT_MENTEE_POLICY_CONFIG: MenteePolicyConfig = {
  features: Object.values(MENTEE_FEATURE_KEYS).reduce(
    (result, featureKey) => {
      result[featureKey] = buildDefaultMenteeFeaturePolicyMatrix(
        MENTEE_FEATURE_DEFINITIONS[featureKey]
      );
      return result;
    },
    {} as Record<MenteeFeatureKey, MenteeFeaturePolicyMatrix>
  ),
};

function mergeMenteeFeaturePolicyMatrix(
  feature: MenteeFeatureKey,
  overrides?: MenteeFeaturePolicyMatrixOverrides
): MenteeFeaturePolicyMatrix {
  const base = DEFAULT_MENTEE_POLICY_CONFIG.features[feature];

  if (!overrides) {
    return {
      account: { ...base.account },
      subscription: base.subscription ? { ...base.subscription } : undefined,
    };
  }

  return {
    account: {
      ...base.account,
      ...(overrides.account ?? {}),
    },
    subscription: base.subscription || overrides.subscription
      ? {
          ...(base.subscription ?? {}),
          ...(overrides.subscription ?? {}),
        }
      : undefined,
  };
}

export function mergeMenteePolicyConfig(
  overrides?: MenteePolicyConfigOverrides | null
): MenteePolicyConfig {
  return {
    features: Object.values(MENTEE_FEATURE_KEYS).reduce(
      (result, featureKey) => {
        result[featureKey] = mergeMenteeFeaturePolicyMatrix(
          featureKey,
          overrides?.features?.[featureKey]
        );
        return result;
      },
      {} as Record<MenteeFeatureKey, MenteeFeaturePolicyMatrix>
    ),
  };
}

export const MENTEE_DASHBOARD_SECTION_FEATURES: Partial<
  Record<DashboardSectionKey, MenteeFeatureKey>
> = {
  explore: MENTEE_FEATURE_KEYS.mentorDirectoryView,
  mentors: MENTEE_FEATURE_KEYS.mentorDirectoryView,
  courses: MENTEE_FEATURE_KEYS.coursesBrowse,
  'my-courses': MENTEE_FEATURE_KEYS.learningWorkspace,
  chat: MENTEE_FEATURE_KEYS.aiChatUse,
  messages: MENTEE_FEATURE_KEYS.messagesView,
  sessions: MENTEE_FEATURE_KEYS.sessionsView,
  subscription: MENTEE_FEATURE_KEYS.subscriptionManage,
  profile: MENTEE_FEATURE_KEYS.profileManage,
};

function normalizeOverrideScopes(
  scopes: readonly MenteeOverrideScope[] | null | undefined,
  isAdmin: boolean | undefined
) {
  if (scopes) {
    return scopes;
  }

  return isAdmin ? ([MENTEE_OVERRIDE_SCOPES.all] as const) : [];
}

function hasMenteeOverrideScope(
  scopes: readonly MenteeOverrideScope[],
  scope: MenteeOverrideScope
) {
  return (
    scopes.includes(MENTEE_OVERRIDE_SCOPES.all) || scopes.includes(scope)
  );
}

function allowFeature(
  definition: MenteeFeatureDefinition,
  hasSubscriptionEntitlement: boolean | null
): MenteeFeatureAccessDecision {
  return {
    key: definition.key,
    label: definition.label,
    mode: 'full',
    allowed: true,
    reasonCode: 'ok',
    blockedSummary: definition.blockedSummary,
    capabilities: definition.capabilities,
    subscriptionFeatureKey: definition.subscriptionFeatureKey ?? null,
    hasSubscriptionEntitlement,
  };
}

function blockFeature(
  definition: MenteeFeatureDefinition,
  reasonCode: MenteeAccessReasonCode,
  hasSubscriptionEntitlement: boolean | null
): MenteeFeatureAccessDecision {
  return {
    key: definition.key,
    label: definition.label,
    mode: 'blocked',
    allowed: false,
    reasonCode,
    blockedSummary: definition.blockedSummary,
    capabilities: definition.capabilities,
    subscriptionFeatureKey: definition.subscriptionFeatureKey ?? null,
    hasSubscriptionEntitlement,
  };
}

function getMenteePolicyConfig(
  config: MenteePolicyConfig | null | undefined
): MenteePolicyConfig {
  if (!config) {
    return DEFAULT_MENTEE_POLICY_CONFIG;
  }

  return config;
}

function getMenteeSubscriptionState(
  subscription: SubscriptionEntitlementSnapshot | null | undefined
): MenteeSubscriptionPolicyState {
  if (subscription?.state === 'missing') {
    return 'missing';
  }

  if (subscription?.state === 'loaded') {
    return 'notInPlan';
  }

  return 'unavailable';
}

export function evaluateMenteeFeatureAccess(
  feature: MenteeFeatureKey,
  context: MenteeAccessContext
): MenteeFeatureAccessDecision {
  const definition = MENTEE_FEATURE_DEFINITIONS[feature];
  const policyConfig = getMenteePolicyConfig(context.policyConfig);
  const featurePolicy = policyConfig.features[feature];
  const overrideScopes = normalizeOverrideScopes(
    context.overrideScopes,
    context.isAdmin
  );

  if (context.isAdmin && hasMenteeOverrideScope(overrideScopes, 'all')) {
    return allowFeature(definition, true);
  }

  if (!context.isMentee) {
    return blockFeature(definition, 'mentee_role_required', null);
  }

  const accountAccess = context.accountAccess;
  if (
    accountAccess &&
    accountAccess.status !== 'active' &&
    !hasMenteeOverrideScope(overrideScopes, 'account')
  ) {
    const accountReasonCode = featurePolicy.account[accountAccess.status];

    if (accountReasonCode && accountReasonCode !== 'ok') {
      return blockFeature(
        definition,
        accountReasonCode,
        definition.subscriptionFeatureKey
          ? hasSubscriptionEntitlement(
              context.subscription,
              definition.subscriptionFeatureKey
            )
          : null
      );
    }
  }

  if (!definition.subscriptionFeatureKey) {
    return allowFeature(definition, null);
  }

  const entitlement = hasSubscriptionEntitlement(
    context.subscription,
    definition.subscriptionFeatureKey
  );

  if (entitlement === true) {
    return allowFeature(definition, entitlement);
  }

  if (hasMenteeOverrideScope(overrideScopes, 'subscription')) {
    return allowFeature(definition, entitlement);
  }

  const subscriptionState = getMenteeSubscriptionState(context.subscription);
  const subscriptionReasonCode =
    featurePolicy.subscription?.[subscriptionState] ??
    (subscriptionState === 'missing'
      ? 'subscription_required'
      : subscriptionState === 'notInPlan'
        ? 'feature_not_in_plan'
        : 'subscription_unavailable');

  if (subscriptionReasonCode === 'ok') {
    return allowFeature(definition, entitlement);
  }

  return blockFeature(definition, subscriptionReasonCode, entitlement);
}

export function buildMenteeAccessPolicySnapshot(
  context: MenteeAccessContext
): MenteeAccessPolicySnapshot {
  const features = Object.values(MENTEE_FEATURE_KEYS).reduce(
    (result, feature) => {
      result[feature] = evaluateMenteeFeatureAccess(feature, context);
      return result;
    },
    {} as Record<MenteeFeatureKey, MenteeFeatureAccessDecision>
  );

  const restrictedReasonCodes = Array.from(
    new Set(
      Object.values(features)
        .filter((feature) => !feature.allowed)
        .map((feature) => feature.reasonCode)
    )
  );

  return {
    isMentee: Boolean(context.isMentee),
    isAdmin: Boolean(context.isAdmin),
    hasActiveSubscription: context.subscription?.state === 'loaded',
    hasRestrictedFeatures: restrictedReasonCodes.length > 0,
    restrictedReasonCodes,
    features,
  };
}

export function getMenteeFeatureDecision(
  snapshot: MenteeAccessPolicySnapshot | null | undefined,
  feature: MenteeFeatureKey
) {
  return snapshot?.features?.[feature] ?? null;
}

export function isMenteeFeatureEnabled(
  snapshot: MenteeAccessPolicySnapshot | null | undefined,
  feature: MenteeFeatureKey
) {
  return Boolean(getMenteeFeatureDecision(snapshot, feature)?.allowed);
}

export function getMenteeDashboardSectionFeature(
  section: DashboardSectionKey
): MenteeFeatureKey | null {
  return MENTEE_DASHBOARD_SECTION_FEATURES[section] ?? null;
}
