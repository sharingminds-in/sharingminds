import { NextRequest, NextResponse } from 'next/server';

import { handleRazorpayWebhook } from '@/lib/payments/server/service';
import { PaymentServiceError } from '@/lib/payments/errors';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');

  try {
    const result = await handleRazorpayWebhook({
      rawBody,
      signature,
      eventId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof PaymentServiceError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : 'Razorpay webhook processing failed';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status }
    );
  }
}
