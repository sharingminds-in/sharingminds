import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cancelActiveSubscriptionsForUser,
  createFeature,
  createPlan,
  createPlanPrice,
  createSubscription,
  deletePlan,
  featureKeyExists,
  findPlanByKey,
  getAnalyticsData,
  getPlanBasic,
  getPlanPrice,
  getSubscriptionStats,
  getUsageRowsForSubscription,
  listFeatureCategories,
  listFeatures,
  listPlanFeaturesForEditor,
  listPlanPrices,
  listPlansWithCounts,
  listSubscriptionsForAdmin,
  updateFeature,
  updatePlan,
  updatePlanPrice,
  upsertPlanFeature,
  getUserWithRoles,
  getEnforcedPlanFeatures,
  getUserSubscription,
} = vi.hoisted(() => ({
  cancelActiveSubscriptionsForUser: vi.fn(),
  createFeature: vi.fn(),
  createPlan: vi.fn(),
  createPlanPrice: vi.fn(),
  createSubscription: vi.fn(),
  deletePlan: vi.fn(),
  featureKeyExists: vi.fn(),
  findPlanByKey: vi.fn(),
  getAnalyticsData: vi.fn(),
  getPlanBasic: vi.fn(),
  getPlanPrice: vi.fn(),
  getSubscriptionStats: vi.fn(),
  getUsageRowsForSubscription: vi.fn(),
  listFeatureCategories: vi.fn(),
  listFeatures: vi.fn(),
  listPlanFeaturesForEditor: vi.fn(),
  listPlanPrices: vi.fn(),
  listPlansWithCounts: vi.fn(),
  listSubscriptionsForAdmin: vi.fn(),
  updateFeature: vi.fn(),
  updatePlan: vi.fn(),
  updatePlanPrice: vi.fn(),
  upsertPlanFeature: vi.fn(),
  getUserWithRoles: vi.fn(),
  getEnforcedPlanFeatures: vi.fn(),
  getUserSubscription: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {
    id: 'id',
    name: 'name',
    email: 'email',
  },
}));

vi.mock('@/lib/db/queries/subscriptions', () => ({
  cancelActiveSubscriptionsForUser,
  createFeature,
  createPlan,
  createPlanPrice,
  createSubscription,
  deletePlan,
  featureKeyExists,
  findPlanByKey,
  getAnalyticsData,
  getPlanBasic,
  getPlanPrice,
  getSubscriptionStats,
  getUsageRowsForSubscription,
  listFeatureCategories,
  listFeatures,
  listPlanFeaturesForEditor,
  listPlanPrices,
  listPlansWithCounts,
  listSubscriptionsForAdmin,
  updateFeature,
  updatePlan,
  updatePlanPrice,
  upsertPlanFeature,
}));

vi.mock('@/lib/db/user-helpers', () => ({
  getUserWithRoles,
}));

vi.mock('@/lib/subscriptions/enforcement', () => ({
  getPlanFeatures: getEnforcedPlanFeatures,
  getUserSubscription,
}));

import {
  getAdminSubscriptionAnalytics,
  getSelfSubscription,
  selectSelfSubscriptionPlan,
  SubscriptionServiceError,
} from '@/lib/subscriptions/server/service';

describe('subscription service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PAYMENTS_PROVIDER;
  });

  it('returns an empty self-subscription payload when no active subscription exists', async () => {
    getUserWithRoles.mockResolvedValue({
      id: 'user-1',
      roles: [{ name: 'mentee', displayName: 'Mentee' }],
    });
    getUserSubscription.mockRejectedValue(new Error('No active subscription found for user user-1'));

    await expect(
      getSelfSubscription('user-1', { audience: 'mentee' })
    ).resolves.toEqual({
      subscription: null,
      features: [],
    });
  });

  it('throws a conflict when self-subscription access requires audience context', async () => {
    getUserWithRoles.mockResolvedValue({
      id: 'user-1',
      roles: [{ name: 'mentee', displayName: 'Mentee' }],
    });
    getUserSubscription.mockRejectedValue(
      new Error('Multiple active subscriptions found for user user-1 across audiences (mentor, mentee); audience context is required')
    );

    await expect(getSelfSubscription('user-1')).rejects.toMatchObject({
      status: 409,
      message:
        'Multiple active subscriptions found. Please provide audience=mentor|mentee.',
    });
  });

  it('rejects selecting a subscription plan that does not match the user role', async () => {
    getUserWithRoles.mockResolvedValue({
      id: 'user-1',
      roles: [{ name: 'mentee', displayName: 'Mentee' }],
    });
    getPlanBasic.mockResolvedValue({
      id: 'plan-1',
      audience: 'mentor',
      name: 'Mentor Pro',
      plan_key: 'mentor_pro',
    });

    await expect(
      selectSelfSubscriptionPlan('user-1', {
        planId: 'plan-1',
      })
    ).rejects.toMatchObject({
      status: 403,
      message: 'Plan audience does not match your role',
    });

    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('allows admins to select a plan outside their user-role audience', async () => {
    getUserWithRoles.mockResolvedValue({
      id: 'admin-1',
      roles: [{ name: 'admin', displayName: 'Admin' }],
    });
    getPlanBasic.mockResolvedValue({
      id: 'plan-1',
      audience: 'mentor',
      name: 'Mentor Pro',
      plan_key: 'mentor_pro',
    });
    createSubscription.mockResolvedValue({ id: 'sub-1' });

    await expect(
      selectSelfSubscriptionPlan('admin-1', {
        planId: 'plan-1',
      })
    ).resolves.toEqual({ id: 'sub-1' });

    expect(cancelActiveSubscriptionsForUser).toHaveBeenCalledWith('admin-1');
    expect(createSubscription).toHaveBeenCalled();
  });

  it('requires payment checkout for paid prices when Razorpay is enabled', async () => {
    process.env.PAYMENTS_PROVIDER = 'razorpay';
    getUserWithRoles.mockResolvedValue({
      id: 'user-1',
      roles: [{ name: 'mentee', displayName: 'Mentee' }],
    });
    getPlanBasic.mockResolvedValue({
      id: 'plan-1',
      audience: 'mentee',
      name: 'Mentee Pro',
      plan_key: 'mentee_pro',
    });
    getPlanPrice.mockResolvedValue({
      id: 'price-1',
      plan_id: 'plan-1',
      amount: 999,
      billing_interval: 'month',
      billing_interval_count: 1,
    });

    await expect(
      selectSelfSubscriptionPlan('user-1', {
        planId: 'plan-1',
        priceId: 'price-1',
      })
    ).rejects.toMatchObject({
      status: 402,
      message: 'Paid subscription plans must be selected through payment checkout.',
    });

    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('blocks paid plan selection without a price id when Razorpay is enabled', async () => {
    process.env.PAYMENTS_PROVIDER = 'razorpay';
    getUserWithRoles.mockResolvedValue({
      id: 'user-1',
      roles: [{ name: 'mentee', displayName: 'Mentee' }],
    });
    getPlanBasic.mockResolvedValue({
      id: 'plan-1',
      audience: 'mentee',
      name: 'Mentee Pro',
      plan_key: 'mentee_pro',
    });
    listPlanPrices.mockResolvedValue([
      {
        id: 'price-1',
        plan_id: 'plan-1',
        amount: 999,
        is_active: true,
      },
    ]);

    await expect(
      selectSelfSubscriptionPlan('user-1', {
        planId: 'plan-1',
      })
    ).rejects.toMatchObject({
      status: 402,
      message: 'Paid subscription plans must be selected through payment checkout.',
    });

    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('rejects invalid admin analytics date ranges', async () => {
    await expect(
      getAdminSubscriptionAnalytics({
        startDate: '2026-04-05T00:00:00.000Z',
        endDate: '2026-04-03T00:00:00.000Z',
        audience: 'all',
      })
    ).rejects.toMatchObject({
      status: 400,
      message: 'startDate must be earlier than or equal to endDate.',
    });

    expect(getAnalyticsData).not.toHaveBeenCalled();
  });
});
