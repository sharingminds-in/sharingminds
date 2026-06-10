/**
 * GET /api/sessions/[sessionId]/livekit/access-token
 *
 * Generates a secure LiveKit access token for an authenticated participant.
 *
 * Security:
 * - Requires authentication
 * - Validates user is a participant of the session
 * - Validates session ID format (UUID)
 * - Generates JWT token server-side only
 * - Tokens expire after 24 hours
 * - Fails loudly on any error
 *
 * Called by: Meeting room page when user joins
 *
 * Response:
 * - 200: Token generated successfully
 * - 400: Invalid session ID
 * - 401: Unauthorized (not logged in)
 * - 403: Forbidden (not a participant or kicked)
 * - 404: Room not found
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { AppHttpError } from '@/lib/http/app-error';
import { nextErrorResponse } from '@/lib/http/next-response-error';
import { getSessionAccessToken } from '@/lib/recordings/server/service';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const sessionIdSchema = z.string().uuid({
  message: 'Session ID must be a valid UUID format',
});

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let requestedSessionId: string | undefined;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      throw new AppHttpError(
        401,
        'Authentication required. Please log in to access the meeting.'
      );
    }

    const userId = session.user.id;

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================
    const { sessionId } = await params;
    requestedSessionId = sessionId;

    const validationResult = sessionIdSchema.safeParse(sessionId);
    if (!validationResult.success) {
      throw new AppHttpError(400, 'Session ID must be a valid UUID', {
        details: validationResult.error.errors,
      });
    }

    // ========================================================================
    // TOKEN GENERATION
    // ========================================================================
    console.log(
      `🔐 Generating access token for user ${userId} in session ${sessionId}`
    );

    const tokenData = await getSessionAccessToken(sessionId, userId);

    console.log(
      `✅ Access token generated for ${tokenData.participantName} in room ${tokenData.roomName}`
    );

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    return NextResponse.json(
      {
        success: true,
        data: {
          token: tokenData.token,
          roomName: tokenData.roomName,
          participantName: tokenData.participantName,
          wsUrl: tokenData.wsUrl,
          expiresAt: tokenData.expiresAt.toISOString(),
        },
        message: 'Access token generated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ CRITICAL ERROR generating access token:', {
      sessionId: requestedSessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return nextErrorResponse(error, 'Failed to generate access token');
  }
}
