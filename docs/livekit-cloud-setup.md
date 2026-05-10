# LiveKit Cloud Setup

This repository is now wired for **LiveKit Cloud** instead of the legacy self-hosted Oracle VM path.

## Current application contract

- Rooms are still created by the app server via `LiveKitRoomManager`.
- Access tokens are still minted by the app server.
- Meeting clients still connect through `NEXT_PUBLIC_LIVEKIT_WS_URL`.
- Room lifecycle webhooks still land on:
  - `/api/livekit/webhook/room-events`
- Recording webhooks can also land on:
  - `/api/livekit/webhook/recording`
- Automatic recording now assumes **LiveKit Cloud Egress uploads directly to object storage**.
- The app no longer expects a local `/tmp/egress` directory or a co-located Egress process.

## Environment variables

Required for base LiveKit Cloud connectivity:

```env
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_WS_URL=https://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_WS_URL=wss://your-project.livekit.cloud
```

Required to enable recording:

```env
LIVEKIT_RECORDING_MODE=cloud
LIVEKIT_EGRESS_S3_ACCESS_KEY=your_s3_access_key
LIVEKIT_EGRESS_S3_SECRET_KEY=your_s3_secret_key
LIVEKIT_EGRESS_S3_REGION=your_storage_region
LIVEKIT_EGRESS_S3_BUCKET=recordings
LIVEKIT_EGRESS_S3_ENDPOINT=https://your-storage-endpoint
LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE=true
```

For Supabase Storage playback and signed URLs:

```env
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=recordings
```

## Recommended initial rollout

The `Build` plan is appropriate for implementation, QA, and very early live traffic, but it has hard free-tier quotas. Keep the env and webhook setup identical to `Ship` so the upgrade is only a billing change later.

1. Create a LiveKit Cloud project on the `Build` plan.
2. Create a server API key/secret in the LiveKit dashboard.
3. Set the LiveKit env vars above in the app deployment.
4. Configure a webhook in the LiveKit dashboard pointing to:
   - `https://<your-app-domain>/api/livekit/webhook/room-events`
5. Leave `LIVEKIT_RECORDING_MODE=disabled` until storage is ready.
6. Once storage is ready, switch `LIVEKIT_RECORDING_MODE=cloud`.

## Supabase Storage for recordings

This codebase is designed to keep playback on the existing Supabase storage path.

Recommended setup:

1. Keep `STORAGE_PROVIDER=supabase`.
2. Use a private Supabase bucket such as `recordings`.
3. Generate **S3-compatible access keys** in Supabase Storage.
4. Use the Supabase S3 endpoint as `LIVEKIT_EGRESS_S3_ENDPOINT`.
5. Use the same bucket name for both:
   - `LIVEKIT_EGRESS_S3_BUCKET`
   - `SUPABASE_STORAGE_BUCKET`

That lets LiveKit Cloud Egress upload files directly into the same bucket that the app already signs playback URLs from.

## Recording behavior

- Recording is still session-driven through `sessions.recording_config`.
- Global rollout is controlled by `LIVEKIT_RECORDING_MODE`.
- If `LIVEKIT_RECORDING_MODE=disabled`, meetings still work and recordings are skipped.
- If `LIVEKIT_RECORDING_MODE=cloud`, the app starts a room-composite egress when the room starts.
- The recording is written directly to object storage under:
  - `sessions/<sessionId>/<timestamp>.mp4`
  - or `sessions/<sessionId>/<timestamp>.ogg` for audio-only sessions
- Webhooks update the `livekit_recordings` table with status, duration, file size, and storage location metadata.
- `sessions.recording_config.quality = "low"` uses custom LiveKit Egress encoding:
  - `resolution: "640x360"`
  - `fps: 15`
  - `bitrate: 600`
  - `audioBitrate: 64`
- Use low quality for Supabase Free smoke tests because Free projects reject objects larger than `50 MB`.

## What changed from the legacy VM setup

The app no longer relies on:

- Oracle VM `livekit-egress`
- `ngrok`
- `/tmp/egress`
- reading recording files from local disk inside Next.js
- webhook targets pointing at `localhost:3000`

The legacy self-hosted notes are now historical reference only.
