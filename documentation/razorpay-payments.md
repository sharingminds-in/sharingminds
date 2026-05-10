# Razorpay Payments

## Rollout Flag

Payments are controlled by `PAYMENTS_PROVIDER`.

- `PAYMENTS_PROVIDER=dummy`: keeps the local/testing payment path.
- `PAYMENTS_PROVIDER=razorpay`: uses Razorpay Checkout, server-side signature verification, and webhooks.

Required Razorpay variables:

```env
PAYMENTS_PROVIDER=razorpay
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
MENTOR_ONBOARDING_FEE_INR=5000
```

The app currently fails loudly for non-INR Razorpay payments. Configure paid plans,
mentors, and courses in `INR` before enabling `PAYMENTS_PROVIDER=razorpay`.

## Covered Flows

- Mentor onboarding fee uses Razorpay Orders.
- Paid session booking creates no scheduled session until payment is verified.
- Subscription plan purchase uses Razorpay Plans and Subscriptions.
- Paid course enrollment creates no enrollment until payment is verified.

Dummy mode preserves existing local behavior for these flows.

## Webhook

Configure this endpoint in Razorpay Dashboard:

```text
/api/razorpay/webhook
```

The handler verifies `X-Razorpay-Signature` against the raw request body and stores
each `X-Razorpay-Event-Id` once in `payment_events` for idempotency.

Recommended events:

- `payment.captured`
- `subscription.authenticated`
- `subscription.activated`
- `subscription.charged`
- `subscription.halted`
- `subscription.cancelled`
- `subscription.completed`
- `subscription.expired`
- `refund.processed`

## Migration

The local migration file is:

```text
lib/db/migrations/0055_razorpay_payments.sql
```

It was intentionally not applied. Run it only after reviewing it against the live
Supabase schema.
