import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { livekitEvents, livekitRecordings } from '@/lib/db/schema';

export type SupportedEgressEvent =
  | 'egress_started'
  | 'egress_updated'
  | 'egress_ended'
  | 'egress_failed';

type BigNumberish = string | number | bigint | null | undefined;

interface NormalizedFileInfo {
  filename?: string;
  location?: string;
  duration?: BigNumberish;
  size?: BigNumberish;
  startedAt?: BigNumberish;
  endedAt?: BigNumberish;
}

export interface NormalizedEgressInfo {
  egressId: string;
  roomName?: string;
  status?: string | number;
  error?: string;
  startedAt?: BigNumberish;
  updatedAt?: BigNumberish;
  endedAt?: BigNumberish;
  file?: NormalizedFileInfo;
  fileResults: NormalizedFileInfo[];
  raw: unknown;
}

export function normalizeEgressInfo(payload: unknown): NormalizedEgressInfo | null {
  const source = extractSourcePayload(payload);

  const egressId = readString(source.egressId ?? source.egress_id);
  if (!egressId) {
    return null;
  }

  return {
    egressId,
    roomName: readString(source.roomName ?? source.room_name) ?? undefined,
    status: source.status,
    error: readString(source.error) ?? undefined,
    startedAt: source.startedAt ?? source.started_at,
    updatedAt: source.updatedAt ?? source.updated_at,
    endedAt: source.endedAt ?? source.ended_at,
    file: normalizeFileInfo(source.file),
    fileResults: normalizeFileInfoList(source.fileResults ?? source.file_results),
    raw: source,
  };
}

export async function syncRecordingFromEgressEvent(
  event: SupportedEgressEvent,
  egressInfo: NormalizedEgressInfo
): Promise<void> {
  const recording = await db.query.livekitRecordings.findFirst({
    where: eq(livekitRecordings.recordingSid, egressInfo.egressId),
  });

  if (!recording) {
    console.warn(
      `⚠️  Received ${event} for unknown recording: ${egressInfo.egressId}`
    );
    return;
  }

  const nextStatus = mapEgressStatus(egressInfo.status, event);
  const previousStatus = recording.status;

  const firstResult = egressInfo.fileResults[0];
  const fileInfo = firstResult ?? egressInfo.file;

  const startedAt =
    parseLiveKitTimestamp(
      fileInfo?.startedAt ?? egressInfo.startedAt
    ) ?? recording.startedAt;
  const completedAt =
    parseLiveKitTimestamp(
      fileInfo?.endedAt ?? egressInfo.endedAt ?? egressInfo.updatedAt
    ) ??
    (nextStatus === 'completed' || nextStatus === 'failed'
      ? new Date()
      : recording.completedAt);
  const durationSeconds =
    parseDurationSeconds(fileInfo?.duration) ?? recording.durationSeconds;
  const fileSizeBytes =
    parseInteger(fileInfo?.size) ?? recording.fileSizeBytes;
  const storageLocation = fileInfo?.location || recording.fileUrl || null;

  const metadata = {
    ...(typeof recording.metadata === 'object' && recording.metadata !== null
      ? recording.metadata
      : {}),
    egressInfo: egressInfo.raw,
    lastWebhookEvent: event,
    lastWebhookSyncedAt: new Date().toISOString(),
  };

  await db
    .update(livekitRecordings)
    .set({
      status: nextStatus,
      startedAt,
      completedAt,
      durationSeconds,
      fileSizeBytes,
      fileUrl: storageLocation,
      errorMessage:
        nextStatus === 'failed'
          ? egressInfo.error || recording.errorMessage
          : nextStatus === 'completed'
            ? null
            : recording.errorMessage,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(livekitRecordings.id, recording.id));

  if (event === 'egress_updated' || previousStatus === nextStatus) {
    return;
  }

  const eventType =
    nextStatus === 'completed'
      ? 'recording_completed'
      : nextStatus === 'failed'
        ? 'recording_failed'
        : 'recording_started';
  const severity =
    nextStatus === 'failed' ? 'error' : ('info' as const);

  await db.insert(livekitEvents).values({
    roomId: recording.roomId,
    eventType,
    eventData: {
      recordingId: recording.id,
      egressId: egressInfo.egressId,
      roomName: egressInfo.roomName ?? null,
      status: nextStatus,
      storageLocation,
      durationSeconds,
      fileSizeBytes,
      webhookEvent: event,
    },
    source: 'webhook',
    severity,
  });
}

function extractSourcePayload(payload: unknown): Record<string, any> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  if ('egressInfo' in payload && payload.egressInfo && typeof payload.egressInfo === 'object') {
    return payload.egressInfo as Record<string, any>;
  }

  if ('egress_info' in payload && payload.egress_info && typeof payload.egress_info === 'object') {
    return payload.egress_info as Record<string, any>;
  }

  return payload as Record<string, any>;
}

function normalizeFileInfo(payload: unknown): NormalizedFileInfo | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const source = payload as Record<string, any>;

  return {
    filename: readString(source.filename) ?? undefined,
    location: readString(source.location) ?? undefined,
    duration: source.duration,
    size: source.size,
    startedAt: source.startedAt ?? source.started_at,
    endedAt: source.endedAt ?? source.ended_at,
  };
}

function normalizeFileInfoList(payload: unknown): NormalizedFileInfo[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => normalizeFileInfo(item))
    .filter((item): item is NormalizedFileInfo => Boolean(item));
}

export function mapEgressStatus(
  status: string | number | undefined,
  event: SupportedEgressEvent
): 'in_progress' | 'completed' | 'failed' {
  const normalized = normalizeStatus(status);

  if (
    normalized === 'EGRESS_FAILED' ||
    normalized === 'EGRESS_ABORTED' ||
    normalized === 'EGRESS_LIMIT_REACHED' ||
    event === 'egress_failed'
  ) {
    return 'failed';
  }

  if (
    normalized === 'EGRESS_COMPLETE' ||
    normalized === 'EGRESS_COMPLETED' ||
    event === 'egress_ended'
  ) {
    return 'completed';
  }

  return 'in_progress';
}

function normalizeStatus(status: string | number | undefined): string | null {
  if (typeof status === 'string') {
    return status.trim().toUpperCase();
  }

  if (typeof status === 'number') {
    switch (status) {
      case 3:
        return 'EGRESS_COMPLETE';
      case 4:
        return 'EGRESS_FAILED';
      case 5:
        return 'EGRESS_ABORTED';
      case 6:
        return 'EGRESS_LIMIT_REACHED';
      case 0:
      case 1:
      case 2:
      default:
        return 'EGRESS_ACTIVE';
    }
  }

  return null;
}

function parseLiveKitTimestamp(value: BigNumberish): Date | null {
  const numericValue = parseInteger(value);
  if (numericValue === null || numericValue <= 0) {
    return null;
  }

  // Webhook payloads may already be seconds, milliseconds, or nanoseconds.
  if (numericValue > 10_000_000_000_000) {
    return new Date(Math.floor(numericValue / 1_000_000));
  }

  if (numericValue > 10_000_000_000) {
    return new Date(numericValue);
  }

  return new Date(numericValue * 1000);
}

function parseDurationSeconds(value: BigNumberish): number | null {
  const numericValue = parseInteger(value);
  if (numericValue === null || numericValue < 0) {
    return null;
  }

  if (numericValue > 10_000_000_000) {
    return Math.max(0, Math.round(numericValue / 1_000_000_000));
  }

  return numericValue;
}

function parseInteger(value: BigNumberish): number | null {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
