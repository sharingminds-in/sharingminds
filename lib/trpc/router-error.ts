import { TRPCError } from '@trpc/server';
import { ZodError } from 'zod';

import { AppHttpError, isAppHttpError } from '@/lib/http/app-error';
import { RateLimitError } from '@/lib/rate-limit';

interface StatusErrorLike {
  status: number;
  message: string;
}

export function mapStatusToTRPCCode(status: number): TRPCError['code'] {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 402:
      return 'PAYMENT_REQUIRED';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

function isStatusErrorLike(error: unknown): error is StatusErrorLike {
  return (
    error instanceof Error &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

export function throwAsTRPCError(
  error: unknown,
  fallbackMessage: string
): never {
  if (error instanceof TRPCError) {
    throw error;
  }

  if (error instanceof RateLimitError) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: error.message,
      cause: error,
    });
  }

  if (isAppHttpError(error)) {
    throw new TRPCError({
      code: mapStatusToTRPCCode(error.status),
      message: error.message,
      cause: error,
    });
  }

  if (isStatusErrorLike(error)) {
    throw new TRPCError({
      code: mapStatusToTRPCCode(error.status),
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof ZodError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.errors[0]?.message ?? 'Invalid input',
      cause: error,
    });
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}
