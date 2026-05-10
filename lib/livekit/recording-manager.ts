/**
 * Recording Manager
 *
 * Production-grade recording lifecycle management: start, stop, status, playback.
 * Uses storage abstraction layer (provider-agnostic).
 *
 * Core Responsibilities:
 * - Start recording via Egress API
 * - Stop recording gracefully
 * - Generate playback URLs with authorization
 * - Manage recording metadata in database
 *
 * Security:
 * - All operations server-side only
 * - Authorization checks before playback
 * - Comprehensive audit logging
 * - Fail-loud error handling
 */

import { EgressClient } from 'livekit-server-sdk';
import { db } from '@/lib/db';
import {
  livekitRooms,
  livekitRecordings,
  livekitEvents,
  sessions,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveRecordingPlaybackAccess } from '@/lib/recordings/authorization';
import { getStorageProvider } from './storage/storage-factory';
import { livekitConfig } from './config';
import {
  createCloudRecordingFileOutput,
  isCloudRecordingEnabled,
} from './cloud-recording-output';
import {
  resolveRecordingEncodingOptions,
  type RecordingEncodingConfig,
} from './recording-encoding';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface RecordingConfig extends RecordingEncodingConfig {
  enabled: boolean;
  audioOnly?: boolean;
}

interface EgressResponse {
  egressId: string;
  roomName: string;
  status: string | number;
}

const STALE_RECORDING_RETRY_THRESHOLD_MS = 5 * 60 * 1000;

// ============================================================================
// START RECORDING
// ============================================================================

/**
 * Start recording for a session
 *
 * Called automatically when first participant joins the room.
 * Creates recording record in database and calls Egress API.
 *
 * @param sessionId - UUID of the session
 * @returns Recording record or null if recording disabled
 * @throws Error if recording fails to start
 */
export async function startRecording(sessionId: string) {
  try {
    if (!isCloudRecordingEnabled()) {
      console.log(
        `⏸️  LiveKit recording is globally disabled. Skipping start for session ${sessionId}`
      );
      return null;
    }

    console.log(`🎬 Starting recording for session ${sessionId}`);

    // ======================================================================
    // GET SESSION AND VALIDATE
    // ======================================================================
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      throw new Error(
        `CRITICAL: Session ${sessionId} not found. Cannot start recording for non-existent session.`
      );
    }

    // ======================================================================
    // CHECK IF RECORDING IS ENABLED
    // ======================================================================
    const recordingConfig = session.recordingConfig as unknown as RecordingConfig | null;

    if (!recordingConfig || !recordingConfig.enabled) {
      console.log(`⏭️  Recording disabled for session ${sessionId}`);
      return null;
    }

    // ======================================================================
    // GET ROOM INFO
    // ======================================================================
    const room = await db.query.livekitRooms.findFirst({
      where: eq(livekitRooms.sessionId, sessionId),
    });

    if (!room) {
      throw new Error(
        `CRITICAL: Room not found for session ${sessionId}. ` +
        `Room must exist before starting recording.`
      );
    }

    // ======================================================================
    // CHECK IF RECORDING ALREADY EXISTS
    // ======================================================================
    const existingRecording = await db.query.livekitRecordings.findFirst({
      where: and(
        eq(livekitRecordings.roomId, room.id),
        eq(livekitRecordings.status, 'in_progress')
      ),
    });

    if (existingRecording) {
      const startedAt = existingRecording.startedAt ? new Date(existingRecording.startedAt) : null;
      const isStale =
        !startedAt ||
        Date.now() - startedAt.getTime() > STALE_RECORDING_RETRY_THRESHOLD_MS;

      if (!isStale) {
        console.log(`⚠️  Recording already in progress for session ${sessionId}`);
        return existingRecording;
      }

      console.warn(
        `⚠️  Detected stale in-progress recording ${existingRecording.id} for session ${sessionId}. ` +
        `Marking as failed before retrying start.`
      );

      await db
        .update(livekitRecordings)
        .set({
          status: 'failed',
          errorMessage: 'Auto-marked as failed after stale detection',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(livekitRecordings.id, existingRecording.id));
    }

    // ======================================================================
    // CALL LIVEKIT CLOUD EGRESS API TO START RECORDING
    // ======================================================================
    const audioOnly =
      Boolean(recordingConfig.audioOnly) || session.meetingType === 'audio';
    const fileType = audioOnly ? 'ogg' : 'mp4';
    const storagePath = buildRecordingStoragePath(sessionId, fileType);
    const output = createCloudRecordingFileOutput(storagePath);
    const encodingOptions = audioOnly
      ? undefined
      : resolveRecordingEncodingOptions(recordingConfig);

    console.log(
      `📡 Starting LiveKit Cloud egress for room ${room.roomName} -> ${storagePath}`
    );

    const egressClient = getEgressClient();
    const egressInfo = (await egressClient.startRoomCompositeEgress(
      room.roomName,
      output,
      {
        layout: 'grid',
        audioOnly,
        videoOnly: false,
        encodingOptions,
      }
    )) as EgressResponse;

    if (!egressInfo.egressId) {
      throw new Error(
        'LiveKit Egress API returned success but no egressId in response'
      );
    }

    const [recording] = await db.insert(livekitRecordings).values({
      roomId: room.id,
      recordingSid: egressInfo.egressId,
      recordingType: 'composite',
      fileType,
      storageProvider: process.env.STORAGE_PROVIDER || 'supabase',
      storagePath,
      status: 'in_progress',
      startedAt: new Date(),
      metadata: {
        egressInfo,
        config: recordingConfig,
        outputPath: storagePath,
        provider: 'livekit-cloud',
      },
    }).returning();

    // ======================================================================
    // LOG EVENT FOR AUDIT TRAIL
    // ======================================================================
    await db.insert(livekitEvents).values({
      roomId: room.id,
      eventType: 'recording_started',
      eventData: {
        recordingId: recording.id,
        egressId: egressInfo.egressId,
        sessionId,
        roomName: room.roomName,
        audioOnly,
        encodingOptions: encodingOptions ?? null,
        storagePath,
      },
      source: 'api',
      severity: 'info',
    });

    console.log(
      `✅ Recording started successfully: ${recording.recordingSid} for session ${sessionId}`
    );

    return recording;
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to start recording for session ${sessionId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// ============================================================================
// STOP RECORDING
// ============================================================================

/**
 * Stop recording for a session
 *
 * Called automatically when last participant leaves the room.
 * Sends stop command to Egress API.
 *
 * @param sessionId - UUID of the session
 * @throws Error if recording fails to stop
 */
export async function stopRecording(sessionId: string): Promise<void> {
  try {
    console.log(`⏹️  Stopping recording for session ${sessionId}`);

    // ======================================================================
    // GET ROOM AND ACTIVE RECORDING
    // ======================================================================
    const room = await db.query.livekitRooms.findFirst({
      where: eq(livekitRooms.sessionId, sessionId),
      with: {
        recordings: {
          where: eq(livekitRecordings.status, 'in_progress'),
        },
      },
    });

    if (!room || !room.recordings.length) {
      console.log(`⏭️  No active recording found for session ${sessionId}`);
      return;
    }

    const recording = room.recordings[0];

    // ======================================================================
    // CALL EGRESS API TO STOP RECORDING
    // ======================================================================
    const egressClient = getEgressClient();
    await egressClient.stopEgress(recording.recordingSid);

    console.log(`✅ Recording stop requested: ${recording.recordingSid}`);
    console.log(`⏳ Waiting for webhook to complete upload and processing...`);

    // Note: Recording will be marked as completed by webhook handler
    // after file is uploaded to storage
  } catch (error) {
    console.error(`❌ Failed to stop recording for session ${sessionId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// ============================================================================
// GET PLAYBACK URL
// ============================================================================

/**
 * Get playback URL for a recording
 *
 * Generates temporary signed URL (expires in 1 hour) with authorization check.
 * Only session participants can access recordings.
 *
 * @param recordingId - UUID of the recording
 * @param userId - ID of the user requesting access
 * @returns Temporary signed URL for playback
 * @throws Error if unauthorized or recording not ready
 */
export async function getPlaybackUrl(recordingId: string, userId: string): Promise<string> {
  try {
    console.log(`🎥 Generating playback URL for recording ${recordingId}`);

    // ======================================================================
    // GET RECORDING WITH SESSION DATA
    // ======================================================================
    const recording = await db.query.livekitRecordings.findFirst({
      where: eq(livekitRecordings.id, recordingId),
      with: {
        room: {
          with: {
            session: true,
          },
        },
      },
    });

    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    // ======================================================================
    // AUTHORIZATION: Check if user is participant
    // ======================================================================
    const session = recording.room.session;
    resolveRecordingPlaybackAccess({
      userId,
      mentorId: session.mentorId,
      menteeId: session.menteeId,
    });

    // ======================================================================
    // CHECK RECORDING STATUS
    // ======================================================================
    if (recording.status !== 'completed') {
      throw new Error(
        `Recording is not ready yet (status: ${recording.status}). ` +
        `Please wait for recording to complete processing.`
      );
    }

    if (!recording.storagePath) {
      throw new Error('Recording has no storage path - data corruption detected');
    }

    // ======================================================================
    // GENERATE SIGNED URL VIA STORAGE PROVIDER
    // ======================================================================
    const storageProvider = getStorageProvider();
    const playbackUrl = await storageProvider.getPlaybackUrl(
      recording.storagePath,
      3600 // 1 hour expiration
    );

    // ======================================================================
    // LOG ACCESS FOR AUDIT TRAIL
    // ======================================================================
    await db.insert(livekitEvents).values({
      roomId: recording.roomId,
      eventType: 'recording_accessed',
      eventData: {
        recordingId,
        userId,
        timestamp: new Date().toISOString(),
        userAgent: 'server', // Could pass from request if available
      },
      source: 'api',
      severity: 'info',
    });

    console.log(`✅ Playback URL generated for user ${userId}`);

    return playbackUrl;
  } catch (error) {
    console.error(`❌ Failed to generate playback URL:`, {
      recordingId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEgressClient(): EgressClient {
  return new EgressClient(
    livekitConfig.server.hostUrl,
    livekitConfig.server.apiKey,
    livekitConfig.server.apiSecret
  );
}

function buildRecordingStoragePath(
  sessionId: string,
  fileType: 'mp4' | 'ogg'
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/Z$/, '');

  return `sessions/${sessionId}/${timestamp}.${fileType}`;
}

