/**
 * LiveKit Room Events Webhook Handler
 *
 * Receives notifications from LiveKit server when room events occur:
 * - room_started: First participant joined
 * - room_finished: Last participant left
 * - participant_joined: New participant connected
 * - participant_left: Participant disconnected
 *
 * Primary Purpose: Trigger auto-recording when room starts
 *
 * Security:
 * - Webhook signature validation via LiveKit WebhookReceiver
 * - Server-side only
 * - Non-blocking (doesn't fail if recording fails)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractSessionIdFromRoomName } from '@/lib/livekit/config';
import {
  normalizeEgressInfo,
  syncRecordingFromEgressEvent,
  type SupportedEgressEvent,
} from '@/lib/livekit/egress-event-sync';
import { startRecording, stopRecording } from '@/lib/livekit/recording-manager';
import {
  LivekitWebhookAuthError,
  LivekitWebhookPayloadError,
  verifyLivekitWebhook,
} from '@/lib/livekit/webhook';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type RoomEventType =
  | 'room_started'
  | 'room_finished'
  | 'participant_joined'
  | 'participant_left'
  | 'track_published'
  | 'track_unpublished';

interface RoomEventWebhook {
  event: RoomEventType;
  room: {
    sid: string;
    name: string;
    empty_timeout: number;
    max_participants: number;
    creation_time: number;
    turn_password: string;
    enabled_codecs: any[];
    metadata: string;
    num_participants: number;
  };
  participant?: {
    sid: string;
    identity: string;
    state: string;
    tracks: any[];
    metadata: string;
    joined_at: number;
    name: string;
    version: number;
  };
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Received room event webhook');

    // ======================================================================
    // PARSE WEBHOOK PAYLOAD
    // ======================================================================
    let payload: any;
    try {
      const rawBody = await verifyLivekitWebhook(request);
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error('❌ Webhook verification failed:', error);
      if (error instanceof LivekitWebhookPayloadError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof LivekitWebhookAuthError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Webhook verification failed' }, { status: 401 });
    }
    const eventType: string | undefined = payload?.event;

    if (!eventType) {
      console.error('❌ Invalid webhook payload: missing event', payload);
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    if (eventType.startsWith('egress')) {
      const egressInfo = normalizeEgressInfo(payload);

      console.log(`📋 Egress event: ${eventType}`, {
        egressId: egressInfo?.egressId,
        status: egressInfo?.status,
        roomName: egressInfo?.roomName,
      });

      if (!egressInfo) {
        console.error('❌ Invalid egress webhook payload:', payload);
        return NextResponse.json({ success: false, message: 'Missing egress info' }, { status: 200 });
      }

      await syncRecordingFromEgressEvent(
        eventType as SupportedEgressEvent,
        egressInfo
      );
      return NextResponse.json({ success: true, message: 'Egress event processed' });
    }

    const body: RoomEventWebhook = payload;

    console.log(`📋 Room event: ${body.event}`, {
      roomName: body.room?.name,
      numParticipants: body.room?.num_participants,
      participantIdentity: body.participant?.identity,
    });

    if (!body.room) {
      console.error('❌ Invalid room webhook payload:', body);
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // ======================================================================
    // HANDLE DIFFERENT EVENT TYPES
    // ======================================================================
    switch (body.event) {
      case 'room_started':
        await handleRoomStarted(body.room);
        break;

      case 'room_finished':
        await handleRoomFinished(body.room);
        break;

      case 'participant_joined':
        console.log(
          `👤 Participant joined: ${body.participant?.identity} in room ${body.room.name}`
        );
        await handleParticipantJoined(body.room);
        break;

      case 'participant_left':
        console.log(
          `👋 Participant left: ${body.participant?.identity} from room ${body.room.name}`
        );
        break;

      default:
        console.log(`⏭️  Ignoring event type: ${body.event}`);
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ Room events webhook error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return 200 even on error - don't block LiveKit webhook delivery
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 } // Return 200 to acknowledge receipt
    );
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle room_started event
 * Triggers automatic recording if enabled for session
 */
async function handleRoomStarted(room: RoomEventWebhook['room']) {
  console.log(`🟢 Room started: ${room.name}`);

  try {
    // Extract session ID from room name (format: session-{uuid})
    const sessionId = extractSessionIdFromRoomName(room.name);

    if (!sessionId) {
      console.warn(
        `⚠️  Could not extract session ID from room name: ${room.name}`
      );
      return;
    }

    console.log(`🎬 Triggering auto-recording for session ${sessionId}`);

    // ======================================================================
    // START RECORDING AUTOMATICALLY
    // ======================================================================
    // Note: This is non-blocking - recording failure shouldn't break the meeting
    await startRecording(sessionId);

    console.log(`✅ Auto-recording triggered successfully for session ${sessionId}`);
  } catch (error) {
    // Log error but don't throw - recording failure shouldn't break webhook
    console.error('❌ Failed to start auto-recording:', {
      roomName: room.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // TODO: Send alert to system administrators
    // TODO: Create system notification for manual recording start
  }
}

/**
 * Handle room_finished event
 * Stops recording if active
 */
async function handleRoomFinished(room: RoomEventWebhook['room']) {
  console.log(`🔴 Room finished: ${room.name}`);

  try {
    // Extract session ID from room name
    const sessionId = extractSessionIdFromRoomName(room.name);

    if (!sessionId) {
      console.warn(
        `⚠️  Could not extract session ID from room name: ${room.name}`
      );
      return;
    }

    console.log(`⏹️  Stopping recording for session ${sessionId}`);

    // ======================================================================
    // STOP RECORDING AUTOMATICALLY
    // ======================================================================
    await stopRecording(sessionId);

    console.log(`✅ Recording stopped successfully for session ${sessionId}`);
  } catch (error) {
    // Log error but don't throw
    console.error('❌ Failed to stop recording:', {
      roomName: room.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // TODO: Send alert to system administrators
  }
}

/**
 * Handle participant_joined event
 * Acts as a fallback trigger for auto-recording when room_started isn't emitted
 */
async function handleParticipantJoined(room: RoomEventWebhook['room']) {
  try {
    // Some LiveKit deployments may omit room_started, so kick off recording
    // when the first participant joins.
    if (room.num_participants !== undefined && room.num_participants > 1) {
      return; // Recording should already be active
    }

    const sessionId = extractSessionIdFromRoomName(room.name);

    if (!sessionId) {
      console.warn(`⚠️  Could not extract session ID from room name: ${room.name}`);
      return;
    }

    console.log(`🎬 Ensuring recording started for session ${sessionId}`);
    await startRecording(sessionId);
  } catch (error) {
    console.error('❌ Failed to ensure recording on participant join:', {
      roomName: room.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
