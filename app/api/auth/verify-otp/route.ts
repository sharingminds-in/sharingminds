import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { nextErrorResponse } from '@/lib/http/next-response-error';
import { authRateLimit, rateLimit } from '@/lib/rate-limit';
import {
  normalizeVerificationEmail,
  verifyVerificationOtp,
} from '@/lib/otp';

const requestSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

const otpVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const email = normalizeVerificationEmail(body.email);

    authRateLimit.check(request);
    otpVerifyRateLimit.check(request, `otp:verify:${email}`);

    const result = await verifyVerificationOtp(email, body.otp);

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return nextErrorResponse(error, 'Failed to verify OTP');
  }
}
