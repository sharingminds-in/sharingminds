import { createTRPCRouter, userProcedure } from '../init';
import {
  getPaymentIntentForUser,
  startCourseEnrollmentPayment,
  startMentorOnboardingPayment,
  startSessionBookingPayment,
  startSubscriptionPayment,
  verifyPayment,
} from '@/lib/payments/server/service';
import {
  getPaymentIntentInputSchema,
  startCourseEnrollmentPaymentInputSchema,
  startSessionBookingPaymentInputSchema,
  startSubscriptionPaymentInputSchema,
  verifyPaymentInputSchema,
} from '@/lib/payments/server/schemas';
import { throwAsTRPCError } from '@/lib/trpc/router-error';

export const paymentsRouter = createTRPCRouter({
  startMentorOnboarding: userProcedure.mutation(async ({ ctx }) => {
    try {
      return await startMentorOnboardingPayment(ctx as any);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to start mentor onboarding payment');
    }
  }),
  startSessionBooking: userProcedure
    .input(startSessionBookingPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await startSessionBookingPayment(ctx as any, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to start session payment');
      }
    }),
  startSubscription: userProcedure
    .input(startSubscriptionPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await startSubscriptionPayment(ctx as any, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to start subscription payment');
      }
    }),
  startCourseEnrollment: userProcedure
    .input(startCourseEnrollmentPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await startCourseEnrollmentPayment(ctx as any, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to start course payment');
      }
    }),
  verify: userProcedure
    .input(verifyPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await verifyPayment(ctx as any, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to verify payment');
      }
    }),
  getIntent: userProcedure
    .input(getPaymentIntentInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPaymentIntentForUser(ctx.userId, input.intentId);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch payment intent');
      }
    }),
});
