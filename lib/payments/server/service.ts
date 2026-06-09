import { and, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  courses,
  mentorContent,
  mentors,
  paymentEvents,
  paymentIntents,
  paymentRefunds,
  subscriptionPlanPrices,
  subscriptionPlans,
  subscriptions,
  users,
} from '@/lib/db/schema';
import { createBooking } from '@/lib/bookings/server/service';
import { resolveSessionPrice } from '@/lib/bookings/session-pricing';
import type { TRPCContext } from '@/lib/trpc/context';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { getPlanFeatures } from '@/lib/subscriptions/enforcement';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { selectSelfSubscriptionPlan } from '@/lib/subscriptions/server/service';
import { enrollInCourse } from '@/lib/learning/server/service';
import { calculateCoursePriceSummary } from '@/lib/learning/course-runtime';
import { canEnrollInCourse } from '@/lib/courses/status';
import { getPaymentConfig, isRazorpayEnabled } from '../config';
import {
  assertRazorpayPaymentAmount,
  assertRazorpayCurrency,
  toCurrencySubunits,
} from '../amounts';
import { getRazorpayClient } from '../razorpay-client';
import {
  verifyRazorpayOrderPaymentSignature,
  verifyRazorpaySubscriptionPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../signatures';
import { buildPaymentIdempotencyKey } from '../idempotency';
import { assertPayment, PaymentServiceError } from '../errors';
import type {
  PaymentCheckoutPayload,
  PaymentPurpose,
} from '../types';
import type {
  StartCourseEnrollmentPaymentInput,
  StartSessionBookingPaymentInput,
  StartSubscriptionPaymentInput,
  VerifyPaymentInput,
} from './schemas';

type AuthenticatedContext = TRPCContext & {
  session: NonNullable<TRPCContext['session']>;
  userId: string;
  currentUser?: NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;
};

type PaymentIntentRow = typeof paymentIntents.$inferSelect;

const COMPLETED_STATUSES = ['completed', 'refunded'];
const REUSABLE_INTENT_STATUSES = ['created', 'requires_action', 'paid'];

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addInterval(date: Date, interval: 'day' | 'week' | 'month' | 'year', count: number) {
  const result = new Date(date);
  switch (interval) {
    case 'day':
      result.setDate(result.getDate() + count);
      break;
    case 'week':
      result.setDate(result.getDate() + count * 7);
      break;
    case 'year':
      result.setFullYear(result.getFullYear() + count);
      break;
    case 'month':
    default:
      result.setMonth(result.getMonth() + count);
      break;
  }
  return result;
}

function unixToDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeNotes(notes: Record<string, string | number | null | undefined>) {
  return Object.fromEntries(
    Object.entries(notes)
      .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined)
      .slice(0, 15)
      .map(([key, value]) => [key, String(value).slice(0, 256)])
  );
}

function buildCompletedPayload(input: {
  purpose: PaymentPurpose;
  amount: number;
  currency: string;
  resource?: { type: string; id: string } | null;
}): PaymentCheckoutPayload {
  return {
    provider: 'dummy',
    purpose: input.purpose,
    status: 'completed',
    intentId: null,
    amount: input.amount,
    amountSubunits: Math.round(input.amount * 100),
    currency: input.currency,
    name: 'SharingMinds',
    description: 'Payment completed',
    resource: input.resource ?? null,
  };
}

function assertIntentAmountStillMatches(
  intent: PaymentIntentRow,
  current: { amount: number; currency: string | null | undefined },
  label: string
) {
  const currency = assertRazorpayCurrency(current.currency);
  const amountSubunits = toCurrencySubunits(current.amount, currency);

  if (
    currency !== intent.currency ||
    amountSubunits !== intent.amountSubunits
  ) {
    throw new PaymentServiceError(
      409,
      `${label} price changed before payment completion. The payment will be refunded.`
    );
  }
}

async function findReusableIntent(idempotencyKey: string) {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.idempotencyKey, idempotencyKey))
    .limit(1);

  if (
    intent &&
    [...REUSABLE_INTENT_STATUSES, ...COMPLETED_STATUSES].includes(intent.status)
  ) {
    return intent;
  }

  return null;
}

async function createIntent(input: {
  userId: string;
  purpose: PaymentPurpose;
  amount: number;
  amountSubunits: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  expiresAt?: Date;
}) {
  const config = getPaymentConfig();
  const [intent] = await db
    .insert(paymentIntents)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      status: 'created',
      provider: config.provider,
      providerMode: config.razorpayMode,
      amount: input.amount.toFixed(2),
      amountSubunits: input.amountSubunits,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      expiresAt: input.expiresAt,
      updatedAt: new Date(),
    })
    .returning();

  return intent;
}

function buildRazorpayCheckoutPayload(input: {
  intent: PaymentIntentRow;
  orderId?: string | null;
  subscriptionId?: string | null;
  name: string;
  description: string;
  prefill?: { name?: string | null; email?: string | null; contact?: string | null };
}): PaymentCheckoutPayload {
  const config = getPaymentConfig();
  return {
    provider: 'razorpay',
    purpose: input.intent.purpose as PaymentPurpose,
    status: 'requires_checkout',
    intentId: input.intent.id,
    keyId: config.razorpayKeyId,
    orderId: input.orderId ?? undefined,
    subscriptionId: input.subscriptionId ?? undefined,
    amount: toNumber(input.intent.amount),
    amountSubunits: input.intent.amountSubunits,
    currency: input.intent.currency,
    name: input.name,
    description: input.description,
    prefill: input.prefill,
    notes: sanitizeNotes({
      intent_id: input.intent.id,
      purpose: input.intent.purpose,
    }),
    resource: null,
  };
}

async function attachOrderToIntent(input: {
  intent: PaymentIntentRow;
  description: string;
}) {
  if (input.intent.providerOrderId) {
    return input.intent;
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: input.intent.amountSubunits,
    currency: input.intent.currency,
    receipt: `pi_${input.intent.id}`,
    notes: sanitizeNotes({
      intent_id: input.intent.id,
      purpose: input.intent.purpose,
      user_id: input.intent.userId,
    }),
  });

  const [updated] = await db
    .update(paymentIntents)
    .set({
      providerOrderId: order.id,
      status: 'requires_action',
      updatedAt: new Date(),
      metadata: {
        ...normalizeMetadata(input.intent.metadata),
        razorpayOrderStatus: order.status,
        description: input.description,
      },
    })
    .where(eq(paymentIntents.id, input.intent.id))
    .returning();

  return updated;
}

async function getCurrentUserOrThrow(userId: string) {
  const user = await getUserWithRoles(userId);
  assertPayment(user, 401, 'Authentication required');
  return user;
}

function hasRole(user: NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>, role: string) {
  return user.roles.some((item) => item.name === role);
}

async function buildPaymentContextForUser(userId: string): Promise<AuthenticatedContext> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  assertPayment(user, 404, 'User not found for paid action completion');

  return {
    db,
    userId,
    session: {
      user,
    } as NonNullable<TRPCContext['session']>,
    req: new Request('https://payments.internal/razorpay-webhook', {
      headers: {
        'user-agent': 'razorpay-webhook',
        'x-forwarded-for': 'razorpay-webhook',
      },
    }),
    accessPolicyCache: undefined as never,
  };
}

async function getSessionBookingAmount(
  userId: string,
  input: StartSessionBookingPaymentInput
) {
  const [mentor] = await db
    .select({
      userId: mentors.userId,
      hourlyRate: mentors.hourlyRate,
      adminHourlyRateOverride: mentors.adminHourlyRateOverride,
      currency: mentors.currency,
      isAvailable: mentors.isAvailable,
      searchMode: mentors.searchMode,
    })
    .from(mentors)
    .where(eq(mentors.userId, input.mentorId))
    .limit(1);

  assertPayment(mentor?.isAvailable, 404, 'Mentor not found or not available');

  let aiPlanHourlyRate: number | null = null;
  let aiPlanCurrency: string | null = null;
  if (input.bookingSource === 'ai' && input.sessionType === 'PAID') {
    assertPayment(
      mentor.searchMode === 'AI_SEARCH',
      403,
      'Mentor is not visible to AI search'
    );

    try {
      const features = await getPlanFeatures(userId, {
        audience: 'mentee',
        actorRole: 'mentee',
      });
      const paidVideoFeature = features.find(
        (feature) =>
          feature.feature_key === FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
      );
      if (
        paidVideoFeature?.limit_amount &&
        paidVideoFeature.limit_amount > 0
      ) {
        aiPlanHourlyRate = paidVideoFeature.limit_amount;
        aiPlanCurrency = paidVideoFeature.limit_currency ?? null;
      }
    } catch {
      aiPlanHourlyRate = null;
      aiPlanCurrency = null;
    }
  }

  const pricing = resolveSessionPrice({
    sessionType: input.sessionType,
    bookingSource: input.bookingSource,
    durationMinutes: input.duration,
    mentorHourlyRate: mentor.hourlyRate,
    mentorCurrency: mentor.currency,
    adminHourlyRateOverride: mentor.adminHourlyRateOverride,
    aiPlanHourlyRate,
    aiPlanCurrency,
  });

  return {
    amount: pricing.amount,
    currency: pricing.currency,
  };
}

export async function startMentorOnboardingPayment(ctx: AuthenticatedContext) {
  const config = getPaymentConfig();
  const [mentor] = await db
    .select()
    .from(mentors)
    .where(eq(mentors.userId, ctx.userId))
    .limit(1);

  assertPayment(mentor, 404, 'Mentor profile not found');

  if (mentor.paymentStatus === 'COMPLETED') {
    return buildCompletedPayload({
      purpose: 'mentor_onboarding',
      amount: 0,
      currency: 'INR',
      resource: { type: 'mentor', id: mentor.id },
    });
  }

  if (config.provider === 'dummy') {
    await db
      .update(mentors)
      .set({ paymentStatus: 'COMPLETED', updatedAt: new Date() })
      .where(eq(mentors.id, mentor.id));

    return buildCompletedPayload({
      purpose: 'mentor_onboarding',
      amount: config.mentorOnboardingFeeInr,
      currency: 'INR',
      resource: { type: 'mentor', id: mentor.id },
    });
  }

  const currency = assertRazorpayCurrency('INR');
  const amountSubunits = toCurrencySubunits(config.mentorOnboardingFeeInr, currency);
  assertRazorpayPaymentAmount(currency, amountSubunits);

  const idempotencyKey = buildPaymentIdempotencyKey({
    purpose: 'mentor_onboarding',
    userId: ctx.userId,
    amount: config.mentorOnboardingFeeInr,
  });
  const existing = await findReusableIntent(idempotencyKey);
  let intent =
    existing ??
    (await createIntent({
      userId: ctx.userId,
      purpose: 'mentor_onboarding',
      amount: config.mentorOnboardingFeeInr,
      amountSubunits,
      currency,
      idempotencyKey,
      metadata: { mentorId: mentor.id },
      expiresAt: addInterval(new Date(), 'day', 1),
    }));

  intent = await attachOrderToIntent({
    intent,
    description: 'Mentor onboarding fee',
  });

  return buildRazorpayCheckoutPayload({
    intent,
    orderId: intent.providerOrderId,
    name: 'SharingMinds Mentor Activation',
    description: 'One-time mentor onboarding fee',
    prefill: {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    },
  });
}

export async function startSessionBookingPayment(
  ctx: AuthenticatedContext,
  input: StartSessionBookingPaymentInput
) {
  if (input.sessionType !== 'PAID') {
    const result = await createBooking(ctx, input, { paymentConfirmed: true });
    return buildCompletedPayload({
      purpose: 'session_booking',
      amount: toNumber(result.booking.rate),
      currency: result.booking.currency || 'INR',
      resource: { type: 'session', id: result.booking.id },
    });
  }

  const user = ctx.currentUser ?? (await getCurrentUserOrThrow(ctx.userId));
  assertPayment(hasRole(user, 'mentee'), 403, 'Mentee access required');

  if (!isRazorpayEnabled()) {
    const result = await createBooking(ctx, input, { paymentConfirmed: true });
    return buildCompletedPayload({
      purpose: 'session_booking',
      amount: toNumber(result.booking.rate),
      currency: result.booking.currency || 'INR',
      resource: { type: 'session', id: result.booking.id },
    });
  }

  const { amount, currency: rawCurrency } = await getSessionBookingAmount(
    ctx.userId,
    input
  );
  if (amount <= 0) {
    const result = await createBooking(ctx, input, { paymentConfirmed: true });
    return buildCompletedPayload({
      purpose: 'session_booking',
      amount,
      currency: rawCurrency,
      resource: { type: 'session', id: result.booking.id },
    });
  }

  const currency = assertRazorpayCurrency(rawCurrency);
  const amountSubunits = toCurrencySubunits(amount, currency);
  assertRazorpayPaymentAmount(currency, amountSubunits);

  const idempotencyKey = buildPaymentIdempotencyKey({
    purpose: 'session_booking',
    userId: ctx.userId,
    input,
    amount,
    currency,
  });
  const existing = await findReusableIntent(idempotencyKey);
  let intent =
    existing ??
    (await createIntent({
      userId: ctx.userId,
      purpose: 'session_booking',
      amount,
      amountSubunits,
      currency,
      idempotencyKey,
      metadata: { bookingInput: input },
      expiresAt: addInterval(new Date(), 'day', 1),
    }));

  intent = await attachOrderToIntent({
    intent,
    description: input.title,
  });

  return buildRazorpayCheckoutPayload({
    intent,
    orderId: intent.providerOrderId,
    name: 'SharingMinds Session Booking',
    description: input.title,
    prefill: {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    },
  });
}

function mapBillingPeriod(interval: string) {
  switch (interval) {
    case 'day':
      return 'daily';
    case 'week':
      return 'weekly';
    case 'year':
      return 'yearly';
    case 'month':
    default:
      return 'monthly';
  }
}

function subscriptionTotalCount(interval: string, intervalCount: number) {
  const base =
    interval === 'day' ? 3650 : interval === 'week' ? 520 : interval === 'year' ? 10 : 120;
  return Math.max(1, Math.ceil(base / Math.max(1, intervalCount)));
}

async function ensureRazorpayPlan(price: {
  id: string;
  providerPlanId: string | null;
  billingInterval: 'day' | 'week' | 'month' | 'year';
  billingIntervalCount: number;
  amount: string;
  currency: string;
  planName: string;
  planDescription: string | null;
}) {
  if (price.providerPlanId) {
    return price.providerPlanId;
  }

  const currency = assertRazorpayCurrency(price.currency);
  const amount = toNumber(price.amount);
  const amountSubunits = toCurrencySubunits(amount, currency);
  assertRazorpayPaymentAmount(currency, amountSubunits);

  const plan = await getRazorpayClient().plans.create({
    period: mapBillingPeriod(price.billingInterval),
    interval: price.billingIntervalCount || 1,
    item: {
      name: price.planName,
      description: price.planDescription || undefined,
      amount: amountSubunits,
      currency,
    },
    notes: sanitizeNotes({
      local_price_id: price.id,
    }),
  });

  await db
    .update(subscriptionPlanPrices)
    .set({
      providerPlanId: plan.id,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPlanPrices.id, price.id));

  return plan.id;
}

export async function startSubscriptionPayment(
  ctx: AuthenticatedContext,
  input: StartSubscriptionPaymentInput
) {
  if (!isRazorpayEnabled()) {
    const subscription = await selectSelfSubscriptionPlan(
      ctx.userId,
      input,
      ctx.currentUser
    );
    return buildCompletedPayload({
      purpose: 'subscription',
      amount: 0,
      currency: 'INR',
      resource: { type: 'subscription', id: subscription.id },
    });
  }

  const user = ctx.currentUser ?? (await getCurrentUserOrThrow(ctx.userId));
  assertPayment(input.priceId, 400, 'A plan price is required for payment checkout.');
  const [price] = await db
    .select({
      id: subscriptionPlanPrices.id,
      planId: subscriptionPlanPrices.planId,
      amount: subscriptionPlanPrices.amount,
      currency: subscriptionPlanPrices.currency,
      billingInterval: subscriptionPlanPrices.billingInterval,
      billingIntervalCount: subscriptionPlanPrices.billingIntervalCount,
      providerPlanId: subscriptionPlanPrices.providerPlanId,
      planName: subscriptionPlans.name,
      planDescription: subscriptionPlans.description,
      audience: subscriptionPlans.audience,
      status: subscriptionPlans.status,
    })
    .from(subscriptionPlanPrices)
    .innerJoin(
      subscriptionPlans,
      eq(subscriptionPlans.id, subscriptionPlanPrices.planId)
    )
    .where(
      and(
        eq(subscriptionPlanPrices.id, input.priceId),
        eq(subscriptionPlanPrices.planId, input.planId),
        eq(subscriptionPlanPrices.isActive, true)
      )
    )
    .limit(1);

  assertPayment(price, 400, 'A valid active plan price is required for payment.');
  assertPayment(price.status === 'active', 400, 'Plan is not active.');

  const isAdmin = hasRole(user, 'admin');
  const allowed =
    isAdmin ||
    (price.audience === 'mentor' && hasRole(user, 'mentor')) ||
    (price.audience === 'mentee' && hasRole(user, 'mentee'));
  assertPayment(allowed, 403, 'Plan audience does not match your role');

  const amount = toNumber(price.amount);
  if (amount <= 0) {
    const subscription = await selectSelfSubscriptionPlan(
      ctx.userId,
      input,
      ctx.currentUser
    );
    return buildCompletedPayload({
      purpose: 'subscription',
      amount,
      currency: price.currency,
      resource: { type: 'subscription', id: subscription.id },
    });
  }

  const currency = assertRazorpayCurrency(price.currency);
  const amountSubunits = toCurrencySubunits(amount, currency);
  assertRazorpayPaymentAmount(currency, amountSubunits);

  const idempotencyKey = buildPaymentIdempotencyKey({
    purpose: 'subscription',
    userId: ctx.userId,
    planId: input.planId,
    priceId: price.id,
    amount,
    currency,
  });
  const existing = await findReusableIntent(idempotencyKey);
  if (existing?.providerSubscriptionId) {
    return buildRazorpayCheckoutPayload({
      intent: existing,
      subscriptionId: existing.providerSubscriptionId,
      name: 'SharingMinds Subscription',
      description: price.planName,
      prefill: {
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      },
    });
  }

  const intent =
    existing ??
    (await createIntent({
      userId: ctx.userId,
      purpose: 'subscription',
      amount,
      amountSubunits,
      currency,
      idempotencyKey,
      metadata: {
        planId: input.planId,
        priceId: price.id,
        audience: price.audience,
      },
      expiresAt: addInterval(new Date(), 'day', 1),
    }));

  const providerPlanId = await ensureRazorpayPlan({
    ...price,
    amount: String(price.amount),
    currency,
  });
  const providerSubscription = await getRazorpayClient().subscriptions.create({
    plan_id: providerPlanId,
    total_count: subscriptionTotalCount(
      price.billingInterval,
      price.billingIntervalCount || 1
    ),
    quantity: 1,
    customer_notify: 1,
    expire_by: Math.floor(addInterval(new Date(), 'day', 1).getTime() / 1000),
    notes: sanitizeNotes({
      intent_id: intent.id,
      local_plan_id: input.planId,
      local_price_id: price.id,
      user_id: ctx.userId,
    }),
  });

  const [localSubscription] = await db
    .insert(subscriptions)
    .values({
      userId: ctx.userId,
      planId: input.planId,
      priceId: price.id,
      status: 'incomplete',
      provider: 'razorpay',
      providerSubscriptionId: providerSubscription.id,
      metadata: {
        paymentIntentId: intent.id,
        razorpayStatus: providerSubscription.status,
      },
      updatedAt: new Date(),
    })
    .returning();

  const [updatedIntent] = await db
    .update(paymentIntents)
    .set({
      status: 'requires_action',
      providerSubscriptionId: providerSubscription.id,
      relatedResourceType: 'subscription',
      relatedResourceId: localSubscription.id,
      metadata: {
        ...normalizeMetadata(intent.metadata),
        localSubscriptionId: localSubscription.id,
        providerPlanId,
        providerSubscriptionStatus: providerSubscription.status,
      },
      updatedAt: new Date(),
    })
    .where(eq(paymentIntents.id, intent.id))
    .returning();

  return buildRazorpayCheckoutPayload({
    intent: updatedIntent,
    subscriptionId: providerSubscription.id,
    name: 'SharingMinds Subscription',
    description: price.planName,
    prefill: {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    },
  });
}

async function getCoursePaymentSummary(
  userId: string,
  input: StartCourseEnrollmentPaymentInput
) {
  const [course] = await db
    .select({
      id: courses.id,
      title: mentorContent.title,
      price: courses.price,
      currency: courses.currency,
      status: mentorContent.status,
    })
    .from(courses)
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(eq(courses.id, input.courseId))
    .limit(1);

  assertPayment(course, 404, 'Course not found');
  assertPayment(canEnrollInCourse(course.status), 400, 'Course is not available for enrollment');

  const coursePrice = parseFloat(course.price || '0');
  let discountPercent: number | null = null;
  try {
    const planFeatures = await getPlanFeatures(userId, {
      audience: 'mentee',
      actorRole: 'mentee',
    });
    const discountFeature = planFeatures.find(
      (feature) => feature.feature_key === FEATURE_KEYS.COURSE_DISCOUNT_PERCENT
    );
    discountPercent = discountFeature?.limit_percent ?? null;
  } catch {
    discountPercent = null;
  }

  const summary = calculateCoursePriceSummary(coursePrice, discountPercent);
  return {
    course,
    coursePrice,
    ...summary,
  };
}

export async function startCourseEnrollmentPayment(
  ctx: AuthenticatedContext,
  input: StartCourseEnrollmentPaymentInput
) {
  const summary = await getCoursePaymentSummary(ctx.userId, input);

  if (!isRazorpayEnabled() || summary.finalPrice <= 0) {
    const result = await enrollInCourse(ctx.userId, input, ctx.currentUser, {
      paymentConfirmed: !isRazorpayEnabled(),
      providerPaymentId: 'dummy',
    });

    return buildCompletedPayload({
      purpose: 'course_enrollment',
      amount: summary.finalPrice,
      currency: summary.course.currency || 'INR',
      resource: { type: 'course_enrollment', id: result.enrollmentId },
    });
  }

  const currency = assertRazorpayCurrency(summary.course.currency || 'INR');
  const amountSubunits = toCurrencySubunits(summary.finalPrice, currency);
  assertRazorpayPaymentAmount(currency, amountSubunits);

  const idempotencyKey = buildPaymentIdempotencyKey({
    purpose: 'course_enrollment',
    userId: ctx.userId,
    input,
    amount: summary.finalPrice,
    currency,
  });
  const existing = await findReusableIntent(idempotencyKey);
  let intent =
    existing ??
    (await createIntent({
      userId: ctx.userId,
      purpose: 'course_enrollment',
      amount: summary.finalPrice,
      amountSubunits,
      currency,
      idempotencyKey,
      metadata: {
        courseInput: input,
        courseId: summary.course.id,
        originalAmount: summary.coursePrice,
        discountAmount: summary.discountAmount,
      },
      expiresAt: addInterval(new Date(), 'day', 1),
    }));

  intent = await attachOrderToIntent({
    intent,
    description: summary.course.title,
  });

  return buildRazorpayCheckoutPayload({
    intent,
    orderId: intent.providerOrderId,
    name: 'SharingMinds Course Enrollment',
    description: summary.course.title,
    prefill: {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    },
  });
}

async function createRefundForIntent(intent: PaymentIntentRow, reason: string) {
  assertPayment(intent.providerPaymentId, 400, 'Cannot refund without a provider payment id.');

  const client = getRazorpayClient();
  const refund = await client.payments.refund(intent.providerPaymentId, {
    amount: intent.amountSubunits,
    notes: sanitizeNotes({
      intent_id: intent.id,
      reason,
    }),
  });

  await db.insert(paymentRefunds).values({
    paymentIntentId: intent.id,
    provider: 'razorpay',
    providerRefundId: refund.id,
    providerPaymentId: intent.providerPaymentId,
    status: refund.status || 'created',
    amount: String(intent.amount),
    amountSubunits: intent.amountSubunits,
    currency: intent.currency,
    reason,
    metadata: refund as unknown as Record<string, unknown>,
    processedAt: new Date(),
    updatedAt: new Date(),
  });

  await db
    .update(paymentIntents)
    .set({
      status: 'refunded',
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(eq(paymentIntents.id, intent.id));
}

async function completeMentorOnboarding(intent: PaymentIntentRow) {
  const [mentor] = await db
    .update(mentors)
    .set({
      paymentStatus: 'COMPLETED',
      updatedAt: new Date(),
    })
    .where(eq(mentors.userId, intent.userId))
    .returning({ id: mentors.id });

  assertPayment(mentor, 404, 'Mentor profile not found');
  return { type: 'mentor', id: mentor.id };
}

async function completeSessionBooking(intent: PaymentIntentRow) {
  const metadata = normalizeMetadata(intent.metadata);
  const bookingInput = metadata.bookingInput as StartSessionBookingPaymentInput | undefined;
  assertPayment(bookingInput, 400, 'Missing booking metadata for payment intent');

  const currentAmount = await getSessionBookingAmount(intent.userId, bookingInput);
  assertIntentAmountStillMatches(intent, currentAmount, 'Session booking');

  const paymentContext = await buildPaymentContextForUser(intent.userId);
  const result = await createBooking(paymentContext, bookingInput, {
    paymentConfirmed: true,
    paymentIntentId: intent.id,
  });

  return { type: 'session', id: result.booking.id };
}

async function completeCourseEnrollment(intent: PaymentIntentRow) {
  const metadata = normalizeMetadata(intent.metadata);
  const courseInput = metadata.courseInput as StartCourseEnrollmentPaymentInput | undefined;
  assertPayment(courseInput, 400, 'Missing course metadata for payment intent');

  const currentSummary = await getCoursePaymentSummary(intent.userId, courseInput);
  assertIntentAmountStillMatches(
    intent,
    {
      amount: currentSummary.finalPrice,
      currency: currentSummary.course.currency,
    },
    'Course enrollment'
  );

  const result = await enrollInCourse(intent.userId, courseInput, undefined, {
    paymentConfirmed: true,
    paymentIntentId: intent.id,
    providerPaymentId: intent.providerPaymentId || undefined,
  });

  return { type: 'course_enrollment', id: result.enrollmentId };
}

function mapRazorpaySubscriptionStatus(status: string | null | undefined) {
  switch (status) {
    case 'authenticated':
    case 'active':
      return 'active';
    case 'halted':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
    case 'completed':
      return 'expired';
    case 'expired':
      return 'expired';
    case 'pending':
    case 'created':
    default:
      return 'incomplete';
  }
}

async function completeSubscription(intent: PaymentIntentRow, providerSubscription?: any) {
  assertPayment(
    intent.providerSubscriptionId,
    400,
    'Missing Razorpay subscription id for payment intent'
  );

  const [localSubscription] = await db
    .select({
      id: subscriptions.id,
      priceId: subscriptions.priceId,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
      interval: subscriptionPlanPrices.billingInterval,
      intervalCount: subscriptionPlanPrices.billingIntervalCount,
    })
    .from(subscriptions)
    .leftJoin(
      subscriptionPlanPrices,
      eq(subscriptionPlanPrices.id, subscriptions.priceId)
    )
    .where(eq(subscriptions.providerSubscriptionId, intent.providerSubscriptionId))
    .limit(1);

  assertPayment(localSubscription, 404, 'Local subscription not found');

  const subscriptionEntity =
    providerSubscription ??
    (await getRazorpayClient().subscriptions.fetch(intent.providerSubscriptionId));
  const nextStatus = mapRazorpaySubscriptionStatus(subscriptionEntity.status);
  const now = new Date();
  const periodStart = unixToDate(subscriptionEntity.current_start) ?? now;
  const periodEnd =
    unixToDate(subscriptionEntity.current_end) ??
    addInterval(
      periodStart,
      (localSubscription.interval || 'month') as 'day' | 'week' | 'month' | 'year',
      localSubscription.intervalCount || 1
    );

  if (nextStatus === 'active') {
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        canceledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscriptions.userId, intent.userId),
          inArray(subscriptions.status, ['trialing', 'active']),
          ne(subscriptions.id, localSubscription.id)
        )
      );
  }

  await db
    .update(subscriptions)
    .set({
      status: nextStatus,
      currentPeriodStart: nextStatus === 'active' ? periodStart : null,
      currentPeriodEnd: nextStatus === 'active' ? periodEnd : null,
      providerCustomerId: subscriptionEntity.customer_id ?? null,
      metadata: {
        paymentIntentId: intent.id,
        razorpayStatus: subscriptionEntity.status,
        razorpaySubscription: subscriptionEntity,
      },
      updatedAt: now,
    })
    .where(eq(subscriptions.id, localSubscription.id));

  return { type: 'subscription', id: localSubscription.id };
}

async function applySuccessfulIntent(intentId: string, providerSubscription?: any) {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, intentId))
    .limit(1);

  assertPayment(intent, 404, 'Payment intent not found');

  if (intent.status === 'completed' && intent.relatedResourceId) {
    return {
      type: intent.relatedResourceType || intent.purpose,
      id: intent.relatedResourceId,
    };
  }

  let resource: { type: string; id: string };
  try {
    if (intent.purpose === 'mentor_onboarding') {
      resource = await completeMentorOnboarding(intent);
    } else if (intent.purpose === 'session_booking') {
      resource = await completeSessionBooking(intent);
    } else if (intent.purpose === 'subscription') {
      resource = await completeSubscription(intent, providerSubscription);
    } else if (intent.purpose === 'course_enrollment') {
      resource = await completeCourseEnrollment(intent);
    } else {
      throw new PaymentServiceError(400, `Unsupported payment purpose: ${intent.purpose}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paid action failed';
    await db
      .update(paymentIntents)
      .set({
        status: 'action_failed',
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id));

    if (intent.provider === 'razorpay' && intent.providerPaymentId) {
      await createRefundForIntent(
        {
          ...intent,
          status: 'action_failed',
        },
        message
      );
    }

    throw error;
  }

  await db
    .update(paymentIntents)
    .set({
      status: 'completed',
      relatedResourceType: resource.type,
      relatedResourceId: resource.id,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paymentIntents.id, intent.id));

  return resource;
}

export async function verifyPayment(
  ctx: AuthenticatedContext,
  input: VerifyPaymentInput
) {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, input.intentId))
    .limit(1);

  assertPayment(intent, 404, 'Payment intent not found');
  assertPayment(intent.userId === ctx.userId, 403, 'Payment intent access denied');
  assertPayment(intent.provider === 'razorpay', 400, 'Payment intent is not a Razorpay intent');

  const config = getPaymentConfig();
  let signatureIsValid = false;
  let providerSubscription: any = null;

  if (intent.providerSubscriptionId) {
    assertPayment(
      input.razorpay_subscription_id === intent.providerSubscriptionId,
      400,
      'Razorpay subscription id mismatch'
    );
    signatureIsValid = verifyRazorpaySubscriptionPaymentSignature({
      paymentId: input.razorpay_payment_id,
      subscriptionId: intent.providerSubscriptionId,
      signature: input.razorpay_signature,
      secret: config.razorpayKeySecret,
    });
    providerSubscription = await getRazorpayClient().subscriptions.fetch(
      intent.providerSubscriptionId
    );
  } else {
    assertPayment(intent.providerOrderId, 400, 'Payment intent has no Razorpay order id');
    assertPayment(
      input.razorpay_order_id === intent.providerOrderId,
      400,
      'Razorpay order id mismatch'
    );
    signatureIsValid = verifyRazorpayOrderPaymentSignature({
      orderId: intent.providerOrderId,
      paymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
      secret: config.razorpayKeySecret,
    });
  }

  assertPayment(signatureIsValid, 400, 'Razorpay payment signature verification failed');

  const payment = await getRazorpayClient().payments.fetch(input.razorpay_payment_id);
  const paymentStatus = String((payment as any).status || '');

  await db
    .update(paymentIntents)
    .set({
      status: paymentStatus === 'captured' || providerSubscription ? 'paid' : 'requires_action',
      providerPaymentId: input.razorpay_payment_id,
      providerCustomerId: (payment as any).customer_id ?? null,
      paidAt: paymentStatus === 'captured' || providerSubscription ? new Date() : null,
      metadata: {
        ...normalizeMetadata(intent.metadata),
        checkoutVerifiedAt: new Date().toISOString(),
        razorpayPaymentStatus: paymentStatus,
        razorpayPayment: payment as unknown as Record<string, unknown>,
      },
      updatedAt: new Date(),
    })
    .where(eq(paymentIntents.id, intent.id));

  if (paymentStatus !== 'captured' && !providerSubscription) {
    return {
      status: 'processing' as const,
      intentId: intent.id,
      resource: null,
      message: 'Payment is authorized and waiting for capture confirmation.',
    };
  }

  const resource = await applySuccessfulIntent(intent.id, providerSubscription);
  return {
    status: 'completed' as const,
    intentId: intent.id,
    resource,
    message: 'Payment verified successfully.',
  };
}

export async function getPaymentIntentForUser(userId: string, intentId: string) {
  const [intent] = await db
    .select({
      id: paymentIntents.id,
      purpose: paymentIntents.purpose,
      status: paymentIntents.status,
      provider: paymentIntents.provider,
      relatedResourceType: paymentIntents.relatedResourceType,
      relatedResourceId: paymentIntents.relatedResourceId,
      amount: paymentIntents.amount,
      currency: paymentIntents.currency,
      lastError: paymentIntents.lastError,
      createdAt: paymentIntents.createdAt,
      updatedAt: paymentIntents.updatedAt,
    })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.userId, userId)))
    .limit(1);

  assertPayment(intent, 404, 'Payment intent not found');
  return intent;
}

function getEntity(payload: any, entityName: string) {
  return payload?.payload?.[entityName]?.entity ?? null;
}

async function findIntentForWebhook(eventType: string, payload: any) {
  const payment = getEntity(payload, 'payment');
  const subscription = getEntity(payload, 'subscription');
  const refund = getEntity(payload, 'refund');

  if (payment?.order_id) {
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerOrderId, payment.order_id))
      .limit(1);
    return { intent, payment, subscription, refund };
  }

  if (subscription?.id) {
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerSubscriptionId, subscription.id))
      .limit(1);
    return { intent, payment, subscription, refund };
  }

  if (refund?.payment_id) {
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerPaymentId, refund.payment_id))
      .limit(1);
    return { intent, payment, subscription, refund };
  }

  return { intent: null, payment, subscription, refund };
}

export async function handleRazorpayWebhook(input: {
  rawBody: string;
  signature: string | null;
  eventId: string | null;
}) {
  const config = getPaymentConfig();
  assertPayment(config.provider === 'razorpay', 404, 'Razorpay payments are not enabled');
  assertPayment(input.signature, 400, 'Missing Razorpay webhook signature');
  assertPayment(input.eventId, 400, 'Missing Razorpay webhook event id');
  assertPayment(
    verifyRazorpayWebhookSignature({
      rawBody: input.rawBody,
      signature: input.signature,
      secret: config.razorpayWebhookSecret,
    }),
    400,
    'Razorpay webhook signature verification failed'
  );

  const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  const eventType = String(payload.event || '');
  assertPayment(eventType, 400, 'Missing Razorpay webhook event type');

  const webhookContext = await findIntentForWebhook(eventType, payload);
  const inserted = await db
    .insert(paymentEvents)
    .values({
      provider: 'razorpay',
      providerMode: config.razorpayMode,
      providerEventId: input.eventId,
      eventType,
      paymentIntentId: webhookContext.intent?.id ?? null,
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  if (inserted.length === 0) {
    return { duplicate: true, processed: false };
  }

  try {
    if (webhookContext.intent && webhookContext.payment?.id) {
      await db
        .update(paymentIntents)
        .set({
          providerPaymentId: webhookContext.payment.id,
          providerCustomerId: webhookContext.payment.customer_id ?? null,
          paidAt:
            webhookContext.payment.status === 'captured'
              ? new Date()
              : webhookContext.intent.paidAt,
          status:
            webhookContext.payment.status === 'captured'
              ? 'paid'
              : webhookContext.intent.status,
          metadata: {
            ...normalizeMetadata(webhookContext.intent.metadata),
            lastWebhookEvent: eventType,
            razorpayPaymentStatus: webhookContext.payment.status,
          },
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, webhookContext.intent.id));
    }

    if (
      webhookContext.intent &&
      (eventType === 'payment.captured' ||
        eventType === 'subscription.authenticated' ||
        eventType === 'subscription.activated' ||
        eventType === 'subscription.charged')
    ) {
      await applySuccessfulIntent(
        webhookContext.intent.id,
        webhookContext.subscription
      );
    }

    if (
      webhookContext.intent &&
      eventType.startsWith('subscription.') &&
      webhookContext.subscription
    ) {
      await completeSubscription(webhookContext.intent, webhookContext.subscription);
    }

    if (webhookContext.intent && eventType === 'refund.processed') {
      await db
        .update(paymentRefunds)
        .set({
          status: 'processed',
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentRefunds.providerRefundId, webhookContext.refund?.id));
    }

    await db
      .update(paymentEvents)
      .set({
        processedAt: new Date(),
      })
      .where(eq(paymentEvents.id, inserted[0].id));

    return { duplicate: false, processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    await db
      .update(paymentEvents)
      .set({
        processingError: message,
        processedAt: new Date(),
      })
      .where(eq(paymentEvents.id, inserted[0].id));

    throw error;
  }
}
