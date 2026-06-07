import { and, eq, gt, sql } from 'drizzle-orm';
import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';

import { recordEmailEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { emailVerifications } from '@/lib/db/schema/email-verifications';
import { AppHttpError } from '@/lib/http/app-error';

export function normalizeVerificationEmail(email: string) {
  return email.trim().toLowerCase();
}

function getGmailCredentials() {
  const user = process.env.GMAIL_APP_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();

  if (!user || !pass) {
    return null;
  }

  return { user, pass };
}

function isConsoleOtpFallbackEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.OTP_DEV_CONSOLE_FALLBACK === 'true'
  );
}

export async function sendVerificationOtp(email: string) {
  try {
    const normalizedEmail = normalizeVerificationEmail(email);
    const otp = randomInt(100000, 1000000);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 mins from now
    const credentials = getGmailCredentials();

    const existingVerification = await db
      .select({ email: emailVerifications.email })
      .from(emailVerifications)
      .where(eq(emailVerifications.email, normalizedEmail))
      .limit(1);

    if (!credentials && !isConsoleOtpFallbackEnabled()) {
      return {
        success: false,
        error: 'Email delivery is not configured. Set GMAIL_APP_USER and GMAIL_APP_PASSWORD in .env.local, then restart the server.',
      };
    }

    if (!credentials) {
      await db
        .insert(emailVerifications)
        .values({ email: normalizedEmail, code: otp, expiresAt })
        .onConflictDoUpdate({
          target: emailVerifications.email,
          set: { code: otp, expiresAt, createdAt: new Date() },
        });

      console.warn(
        `[auth:otp] OTP_DEV_CONSOLE_FALLBACK is enabled. OTP for ${normalizedEmail}: ${otp}`
      );

      return {
        success: true,
        message: 'OTP generated in local fallback mode. Check the server console for the code.',
      };
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: credentials.user,
        pass: credentials.pass,
      },
    });

    await transporter.verify();

    await db
      .insert(emailVerifications)
      .values({ email: normalizedEmail, code: otp, expiresAt })
      .onConflictDoUpdate({
        target: emailVerifications.email,
        set: { code: otp, expiresAt, createdAt: new Date() },
      });

    try {
      const action = existingVerification.length > 0
        ? 'email.auth.otp.resend'
        : 'email.auth.otp';

      await recordEmailEvent({
        action,
        to: normalizedEmail,
        subject: 'Your Verification Code',
        template: 'auth-otp',
        actorType: 'system',
      });
    } catch (error) {
      console.error('Failed to record OTP email audit event:', error);
    }

    await transporter.sendMail({
      from: `"SharingMinds" <${credentials.user}>`,
      to: normalizedEmail,
      subject: 'Your Verification Code',
      html: `
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Thank you for signing up. Please use the following code to verify your email address:</p>
          <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
            ${otp}
          </p>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    });

    return { success: true, message: 'OTP sent successfully' };
  } catch (err: any) {
    console.error("Error sending OTP:", err);
    return {
      success: false,
      error: err?.code === 'EAUTH'
        ? 'Email provider authentication failed. Check GMAIL_APP_USER and GMAIL_APP_PASSWORD.'
        : 'Failed to send OTP',
    };
  }
}

export async function verifyVerificationOtp(email: string, otp: string) {
  const normalizedEmail = normalizeVerificationEmail(email);

  const deleted = await db
    .delete(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, normalizedEmail),
        eq(emailVerifications.code, Number(otp)),
        gt(emailVerifications.expiresAt, sql`now()`)
      )
    )
    .returning({ id: emailVerifications.id });

  if (deleted.length === 0) {
    throw new AppHttpError(400, 'Invalid or expired OTP');
  }

  return {
    success: true,
    message: 'OTP verified',
  };
}
