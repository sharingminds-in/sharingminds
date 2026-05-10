import { z } from 'zod';

import { createBookingInputSchema } from '@/lib/bookings/server/schemas';
import { enrollCourseInputSchema } from '@/lib/learning/server/schemas';

export const startSessionBookingPaymentInputSchema = createBookingInputSchema;

export const startCourseEnrollmentPaymentInputSchema = enrollCourseInputSchema;

export const startSubscriptionPaymentInputSchema = z.object({
  planId: z.string().uuid(),
  priceId: z.string().uuid().optional(),
  status: z.enum(['active', 'trialing']).optional(),
});

export const verifyPaymentInputSchema = z.object({
  intentId: z.string().uuid(),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  razorpay_order_id: z.string().min(1).optional(),
  razorpay_subscription_id: z.string().min(1).optional(),
});

export const getPaymentIntentInputSchema = z.object({
  intentId: z.string().uuid(),
});

export type StartSessionBookingPaymentInput = z.infer<
  typeof startSessionBookingPaymentInputSchema
>;
export type StartSubscriptionPaymentInput = z.infer<
  typeof startSubscriptionPaymentInputSchema
>;
export type StartCourseEnrollmentPaymentInput = z.infer<
  typeof startCourseEnrollmentPaymentInputSchema
>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentInputSchema>;
