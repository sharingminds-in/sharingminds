/**
 * GET /api/recordings/[id]/playback-url
 *
 * Generate temporary signed URL for recording playback.
 *
 * Security:
 * - Requires authentication
 * - Authorization: Only session participants can access
 * - Returns signed URL with 1-hour expiration
 * - Fail-loud error handling
 *
 * Response:
 * - 200: Signed URL generated
 * - 401: Unauthorized
 * - 403: Forbidden (not a participant)
 * - 404: Recording not found
 * - 423: Recording not ready (still processing)
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AppHttpError } from '@/lib/http/app-error';
import { nextErrorResponse } from '@/lib/http/next-response-error';
import { getRecordingPlaybackUrl } from '@/lib/recordings/server/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let recordingId: string | undefined;

  try {
    ({ id: recordingId } = await params);

    // ======================================================================
    // AUTHENTICATION
    // ======================================================================
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      throw new AppHttpError(401, 'Authentication required to access recording');
    }

    const userId = session.user.id;
    console.log(
      `🎥 Playback URL request: recording=${recordingId}, user=${userId}`
    );

    const playback = await getRecordingPlaybackUrl(recordingId, userId);

    console.log(
      `✅ Playback URL generated for user ${userId}, expires at ${playback.expiresAt}`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          playbackUrl: playback.playbackUrl,
          expiresAt: playback.expiresAt,
          expiresIn: playback.expiresIn,
        },
        message: 'Playback URL generated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Playback URL generation error:', {
      recordingId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return nextErrorResponse(error, 'Failed to generate playback URL');
  }
}
