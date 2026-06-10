import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AppHttpError } from '@/lib/http/app-error';
import { nextErrorResponse } from '@/lib/http/next-response-error';
import { authRateLimit, rateLimit } from '@/lib/rate-limit';
import {
  normalizeVerificationEmail,
  sendVerificationOtp,
} from '@/lib/otp';

const requestSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

const otpSendRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const email = normalizeVerificationEmail(body.email);

    authRateLimit.check(request);
    otpSendRateLimit.check(request, `otp:send:${email}`);

    const result = await sendVerificationOtp(email);
    if (!result.success) {
      throw new AppHttpError(500, result.error || 'Failed to send OTP');
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return nextErrorResponse(error, 'Failed to send OTP');
  }
}
