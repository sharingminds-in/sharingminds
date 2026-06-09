import { adminProcedure, createTRPCRouter } from '../init';
import {
  getAdminAccessPolicyConfig,
  publishAdminAccessPolicyDraft,
  resetAdminAccessPolicyDraft,
  upsertAdminAccessPolicyDraft,
} from '@/lib/access-policy/admin-service';
import {
  adminResetAccessPolicyDraftInputSchema,
  adminUpsertAccessPolicyDraftInputSchema,
} from '@/lib/access-policy/admin-schemas';
import {
  createAdminMentorUser,
  createAdminUser,
  getAdminMentorAudit,
  getAdminMentorPricingHistory,
  getAdminOverview,
  getAdminPolicies,
  listAdminEnquiries,
  listAdminMentees,
  listAdminMentors,
  listAdminUsers,
  promoteAdminUserToSuper,
  resetAdminPolicies,
  sendAdminMentorCoupon,
  updateAdminEnquiry,
  updateAdminMentor,
  updateAdminMentorPricing,
  updateAdminPolicies,
} from '@/lib/admin/server/service';
import {
  adminCreateMentorUserInputSchema,
  adminCreateAdminUserInputSchema,
  adminGetMentorAuditInputSchema,
  adminGetMentorPricingHistoryInputSchema,
  adminPromoteAdminUserInputSchema,
  adminSendMentorCouponInputSchema,
  adminUpdateEnquiryInputSchema,
  adminUpdateMentorInputSchema,
  adminUpdateMentorPricingInputSchema,
  adminUpdatePoliciesInputSchema,
} from '@/lib/admin/server/schemas';
import { throwAsTRPCError } from '@/lib/trpc/router-error';

export const adminRouter = createTRPCRouter({
  overview: adminProcedure.query(async ({ ctx }) => {
    try {
      return await getAdminOverview(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch admin overview');
    }
  }),
  listMentors: adminProcedure.query(async ({ ctx }) => {
    try {
      return await listAdminMentors(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch mentors');
    }
  }),
  listUsers: adminProcedure.query(async ({ ctx }) => {
    try {
      return await listAdminUsers(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch users');
    }
  }),
  createMentorUser: adminProcedure
    .input(adminCreateMentorUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAdminMentorUser(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create mentor user');
      }
    }),
  createAdminUser: adminProcedure
    .input(adminCreateAdminUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAdminUser(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create admin user');
      }
    }),
  promoteAdminUser: adminProcedure
    .input(adminPromoteAdminUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await promoteAdminUserToSuper(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to promote admin user');
      }
    }),
  updateMentor: adminProcedure
    .input(adminUpdateMentorInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateAdminMentor(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update mentor');
      }
    }),
  updateMentorPricing: adminProcedure
    .input(adminUpdateMentorPricingInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateAdminMentorPricing(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update mentor pricing');
      }
    }),
  sendMentorCoupon: adminProcedure
    .input(adminSendMentorCouponInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendAdminMentorCoupon(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to send mentor coupon');
      }
    }),
  getMentorAudit: adminProcedure
    .input(adminGetMentorAuditInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getAdminMentorAudit(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch mentor audit history');
      }
    }),
  getMentorPricingHistory: adminProcedure
    .input(adminGetMentorPricingHistoryInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getAdminMentorPricingHistory(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch mentor pricing history');
      }
    }),
  listMentees: adminProcedure.query(async ({ ctx }) => {
    try {
      return await listAdminMentees(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch mentees');
    }
  }),
  listEnquiries: adminProcedure.query(async ({ ctx }) => {
    try {
      return await listAdminEnquiries(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch enquiries');
    }
  }),
  updateEnquiry: adminProcedure
    .input(adminUpdateEnquiryInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateAdminEnquiry(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update enquiry');
      }
    }),
  getPolicies: adminProcedure.query(async ({ ctx }) => {
    try {
      return await getAdminPolicies(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch policies');
    }
  }),
  updatePolicies: adminProcedure
    .input(adminUpdatePoliciesInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateAdminPolicies(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update policies');
      }
    }),
  resetPolicies: adminProcedure.mutation(async ({ ctx }) => {
    try {
      return await resetAdminPolicies(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to reset policies');
    }
  }),
  getAccessPolicyConfig: adminProcedure.query(async ({ ctx }) => {
    try {
      return await getAdminAccessPolicyConfig(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch access policy config');
    }
  }),
  upsertAccessPolicyDraft: adminProcedure
    .input(adminUpsertAccessPolicyDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await upsertAdminAccessPolicyDraft(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update access policy draft');
      }
    }),
  publishAccessPolicyDraft: adminProcedure.mutation(async ({ ctx }) => {
    try {
      return await publishAdminAccessPolicyDraft(ctx as never);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to publish access policy draft');
    }
  }),
  resetAccessPolicyDraft: adminProcedure
    .input(adminResetAccessPolicyDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await resetAdminAccessPolicyDraft(ctx as never, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to reset access policy draft');
      }
    }),
});
