/**
 * GET /api/sessions/[sessionId]/recordings
 *
 * List all recordings for a session.
 *
 * Security:
 * - Requires authentication
 * - Authorization: Only session participants can list
 * - Returns recording metadata (not playback URLs)
 *
 * Response:
 * - 200: Array of recordings
 * - 401: Unauthorized
 * - 403: Forbidden
 * - 404: Session not found
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AppHttpError } from '@/lib/http/app-error';
import { nextErrorResponse } from '@/lib/http/next-response-error';
import { listSessionRecordings } from '@/lib/recordings/server/service';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const resolvedParams = await context.params;
  const { sessionId } = resolvedParams;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      throw new AppHttpError(401, 'Authentication required');
    }

    const userId = session.user.id;

    console.log(`📋 List recordings request: session=${sessionId}, user=${userId}`);
    const recordings = await listSessionRecordings(sessionId, userId);

    console.log(`✅ Found ${recordings.length} recordings for session ${sessionId}`);

    return NextResponse.json({
      success: true,
      data: recordings,
      message: `Found ${recordings.length} recording(s)`,
    });
  } catch (error) {
    console.error('❌ List recordings error:', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return nextErrorResponse(error, 'Failed to list recordings');
  }
}
