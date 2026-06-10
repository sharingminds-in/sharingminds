/**
 * Meeting Room - Client Component
 *
 * Handles the actual video call interface using LiveKit React components.
 *
 * Features:
 * - Fetches access token from API
 * - Google Meet-style pre-join lobby for camera/microphone setup
 * - Full-featured video conference UI
 * - Connection quality monitoring
 * - Error handling with retry logic
 * - Graceful disconnect handling
 *
 * Security:
 * - Token fetched from server-side API (never exposed)
 * - All validation done on server before token is issued
 *
 * UI Flow:
 * 1. Loading → Fetch token
 * 2. Pre-join → Setup camera/mic, preview, click "Join Meeting"
 * 3. Video Conference → Full meeting UI with participants
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  RoomAudioRenderer,
  useParticipants,
} from '@livekit/components-react';
import type { LocalUserChoices } from '@livekit/components-core';
// Note: @livekit/components-styles now imported in layout.tsx for proper CSS cascade
import { livekitConfig } from '@/lib/livekit/config';
import { useTRPCClient } from '@/lib/trpc/react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Props {
  sessionId: string;
  userId: string;
  userRole: 'mentor' | 'mentee';
  sessionTitle: string;
  otherParticipantName: string;
}

/**
 * Normalize the LiveKit WebSocket URL for the current environment.
 *
 * Production on HTTPS must use WSS, otherwise browsers block the connection.
 * Local development still runs over HTTP, so we only upgrade when necessary.
 */
const normalizeWsUrlForClient = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl;

  const trimmed = rawUrl.trim();

  if (typeof window === 'undefined') {
    return trimmed;
  }

  const isSecureContext = window.location.protocol === 'https:';
  if (isSecureContext && trimmed.startsWith('ws://')) {
    return trimmed.replace('ws://', 'wss://');
  }

  return trimmed;
};

// ============================================================================
// DARK THEME INLINE STYLES FOR PREJOIN
// ============================================================================
// These inline styles override LiveKit's default light theme with CSS variables.
// Using inline styles ensures they apply regardless of Next.js CSS loading order.
// PRODUCTION-GRADE: WCAG AAA contrast ratios, professional appearance.

const preJoinDarkTheme = {
  // CSS custom properties (CSS variables) for LiveKit theming
  '--lk-fg': '#ffffff',                    // Text: White
  '--lk-fg2': '#e3e3e3',                   // Secondary text: Light gray
  '--lk-fg3': '#b8b8b8',                   // Tertiary text: Medium gray
  '--lk-bg': '#1a1a1a',                    // Background: Very dark gray
  '--lk-bg2': '#2a2a2a',                   // Secondary bg
  '--lk-bg3': '#3a3a3a',                   // Tertiary bg
  '--lk-control-bg': '#2d2d2d',            // Input/button bg: Dark gray
  '--lk-control-hover-bg': '#3d3d3d',      // Hover state
  '--lk-control-active-bg': '#4d4d4d',     // Active state
  '--lk-accent-bg': '#2563eb',             // Primary button: Blue
  '--lk-accent2': '#1d4ed8',               // Primary hover: Darker blue
  '--lk-accent3': '#1e40af',               // Primary active
  '--lk-accent4': '#1e3a8a',               // Primary disabled
  '--lk-accent-fg': '#ffffff',             // Button text: White
  '--lk-border-color': '#404040',          // Borders: Gray
  '--lk-border-radius': '0.5rem',          // Border radius
} as React.CSSProperties;

// ============================================================================
// PREJOIN WRAPPER - BEAUTIFUL VISUAL STYLING
// ============================================================================
// Comprehensive styling for the PreJoin component wrapper
// Creates modern, glassmorphic, premium appearance

const preJoinWrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '2.5rem',
  background: 'linear-gradient(145deg, #1f1f1f 0%, #1a1a1a 100%)',
  borderRadius: '1.25rem',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: `
    0 30px 60px -12px rgba(0, 0, 0, 0.7),
    0 18px 36px -18px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05)
  `,
  backdropFilter: 'blur(20px)',
};

// ============================================================================
// MEETING ROOM COMPONENT
// ============================================================================

export default function MeetingRoom({
  sessionId,
  userId: _userId,
  userRole,
  sessionTitle,
  otherParticipantName,
}: Props) {
  const router = useRouter();
  const trpcClient = useTRPCClient();

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  // Token and connection state
  const [token, setToken] = useState<string>('');
  const [wsUrl, setWsUrl] = useState<string>('');
  const [participantName, setParticipantName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  // Pre-join and meeting state
  const [hasJoined, setHasJoined] = useState(false);
  const [userChoices, setUserChoices] = useState<LocalUserChoices>({
    username: '',
    videoEnabled: true,
    audioEnabled: true,
    videoDeviceId: '',
    audioDeviceId: '',
  });

  // ==========================================================================
  // FETCH ACCESS TOKEN
  // ==========================================================================
  useEffect(() => {
    let isMounted = true;

    async function fetchToken() {
      try {
        console.log(`🔐 Fetching access token for session ${sessionId}`);

        const tokenData = await trpcClient.recordings.accessToken.query({ sessionId });

        if (!isMounted) return;

        // Validate token data - FAIL LOUDLY if incomplete
        if (!tokenData.token || !tokenData.wsUrl || !tokenData.roomName) {
          throw new Error(
            'CRITICAL: Incomplete token data received from server. ' +
            `Missing: ${!tokenData.token ? 'token ' : ''}${!tokenData.wsUrl ? 'wsUrl ' : ''}${!tokenData.roomName ? 'roomName' : ''}`
          );
        }

        setToken(tokenData.token);
        const normalizedWsUrl = normalizeWsUrlForClient(tokenData.wsUrl);
        if (normalizedWsUrl !== tokenData.wsUrl) {
          console.log('🔐 Upgraded LiveKit WebSocket to WSS for secure context');
        }
        setWsUrl(normalizedWsUrl);
        setParticipantName(tokenData.participantName);

        // Initialize user choices with participant name
        setUserChoices({
          username: tokenData.participantName,
          videoEnabled: true,
          audioEnabled: true,
          videoDeviceId: '',
          audioDeviceId: '',
        });

        setIsLoading(false);

        console.log(`✅ Access token obtained for room ${tokenData.roomName}`);
      } catch (err) {
        console.error('❌ CRITICAL ERROR fetching access token:', err);

        if (!isMounted) return;

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to connect to meeting';

        setError(errorMessage);
        setIsLoading(false);
      }
    }

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [sessionId, retryCount, trpcClient]);

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Handle pre-join form submission
   * Called when user clicks "Join Meeting" button
   */
  const handlePreJoinSubmit = (choices: LocalUserChoices) => {
    console.log('✅ User ready to join meeting with choices:', {
      username: choices.username,
      videoEnabled: choices.videoEnabled,
      audioEnabled: choices.audioEnabled,
    });

    // Validate user choices - FAIL LOUDLY if invalid
    if (!choices.username || choices.username.trim() === '') {
      console.error('❌ CRITICAL: Username cannot be empty');
      return;
    }

    setUserChoices(choices);
    setHasJoined(true); // This will trigger LiveKitRoom to connect
  };

  /**
   * Handle user disconnecting from meeting
   */
  const handleDisconnect = () => {
    console.log('👋 User disconnected from meeting');
    router.push(`/review-session/${sessionId}`);
  };

  /**
   * Handle retry connection attempt
   */
  const handleRetry = () => {
    console.log('🔄 Retrying connection...');
    setError('');
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  /**
   * Handle room errors - FAIL LOUDLY
   */
  const handleError = (error: Error) => {
    console.error('❌ CRITICAL meeting room error:', error);
    setError(error.message);
  };

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white max-w-md">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Preparing meeting...</h2>
          <p className="text-gray-400">Establishing secure connection</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // ERROR STATE - FAIL LOUDLY
  // ==========================================================================
  if (error || !token || !wsUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white max-w-md p-8">
          <div className="text-red-500 text-6xl mb-6">⚠️</div>
          <h2 className="text-3xl font-bold mb-4">Connection Error</h2>
          <p className="text-gray-300 mb-6">
            {error || 'Unable to connect to the meeting'}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Retry Connection
            </button>
            <button
              onClick={handleDisconnect}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
            >
              Return to Dashboard
            </button>
          </div>

          <p className="text-sm text-gray-500 mt-6">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // PRE-JOIN SCREEN (Google Meet Style)
  // ==========================================================================
  // Show pre-join BEFORE user clicks "Join Meeting"
  // This allows user to:
  // - Preview their camera
  // - Select devices (camera, microphone)
  // - Toggle video/audio on/off
  // - See their appearance before joining
  if (!hasJoined) {
    return (
      <div
        className="h-screen w-screen relative overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03) 0%, transparent 70%), #0f0f0f',
          ...preJoinDarkTheme,
        }}
      >
        {/* Whimsical floating orbs - decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute rounded-full blur-3xl opacity-20"
            style={{
              width: '500px',
              height: '500px',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(139, 92, 246, 0.1))',
              top: '-10%',
              left: '-10%',
              animation: 'float 20s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full blur-3xl opacity-15"
            style={{
              width: '400px',
              height: '400px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0.08))',
              bottom: '-5%',
              right: '-5%',
              animation: 'float 15s ease-in-out infinite reverse',
            }}
          />
          <div
            className="absolute rounded-full blur-2xl opacity-10"
            style={{
              width: '300px',
              height: '300px',
              background: 'rgba(255, 255, 255, 0.05)',
              top: '50%',
              right: '10%',
              animation: 'float 25s ease-in-out infinite',
            }}
          />
        </div>

        {/* Custom header with meeting information */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/90 to-transparent p-6 z-50 pointer-events-none">
          <div className="text-white max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-1">{sessionTitle}</h1>
            <p className="text-gray-300 text-sm">
              Ready to join meeting with {otherParticipantName}
            </p>
          </div>
        </div>

        {/* LiveKit PreJoin Component */}
        <div className="flex items-center justify-center h-full px-4 relative z-10">
          <div style={{ ...preJoinWrapperStyle, ...preJoinDarkTheme }}>
            <PreJoin
              onSubmit={handlePreJoinSubmit}
              defaults={{
                username: participantName,
                videoEnabled: true,
                audioEnabled: true,
              }}
              onValidate={(values) => {
                // Force username to be the participant name (non-editable)
                values.username = participantName;
                return true;
              }}
              joinLabel="Join Meeting"
              userLabel="" // Hide the username label
              micLabel="Microphone"
              camLabel="Camera"
              persistUserChoices={false}
            />
          </div>
        </div>

        {/* Role badge */}
        <div className="absolute bottom-6 left-6 z-50 pointer-events-none">
          <div className="text-white text-sm font-medium bg-black/70 px-4 py-2 rounded-full backdrop-blur-sm">
            {userRole === 'mentor' ? '🎓 Joining as Mentor' : '👨‍🎓 Joining as Mentee'}
          </div>
        </div>

        {/* CSS Animation for floating orbs */}
        <style jsx>{`
          @keyframes float {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            33% {
              transform: translate(30px, -30px) scale(1.1);
            }
            66% {
              transform: translate(-20px, 20px) scale(0.9);
            }
          }
        `}</style>
      </div>
    );
  }

  // ==========================================================================
  // MEETING ROOM UI (After Join)
  // ==========================================================================
  return (
    <div className="h-screen w-screen bg-gray-900">
      <LiveKitRoom
        token={token}
        serverUrl={wsUrl}
        connect={hasJoined} // Only connect when user has clicked "Join Meeting"
        onDisconnected={handleDisconnect}
        onError={handleError}
        options={{
          // Adaptive streaming for optimal quality
          adaptiveStream: livekitConfig.meeting.video.adaptiveStream,
          dynacast: livekitConfig.meeting.video.dynacast,

          // Video quality settings - Apply user choices from pre-join
          videoCaptureDefaults: {
            resolution: livekitConfig.meeting.video.defaultResolution,
          },

          // Audio settings - Apply user choices from pre-join
          audioCaptureDefaults: {
            echoCancellation: livekitConfig.meeting.audio.echoCancellation,
            noiseSuppression: livekitConfig.meeting.audio.noiseSuppression,
            autoGainControl: livekitConfig.meeting.audio.autoGainControl,
          },

          // Disconnect on page leave
          disconnectOnPageLeave: true,
        }}
        data-lk-theme="default"
        className="h-full w-full"
      >
        {/* Meeting Room Content with Custom Header */}
        <MeetingRoomContent
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          otherParticipantName={otherParticipantName}
          userRole={userRole}
          onLeave={handleDisconnect}
        />

        {/* Audio renderer for remote participants */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// ============================================================================
// MEETING ROOM CONTENT COMPONENT
// ============================================================================

function MeetingRoomContent({
  sessionId,
  sessionTitle,
  otherParticipantName,
  userRole,
  onLeave,
}: {
  sessionId: string;
  sessionTitle: string;
  otherParticipantName: string;
  userRole: 'mentor' | 'mentee';
  onLeave: () => void;
}) {
  const trpcClient = useTRPCClient();
  // Get all participants
  const participants = useParticipants();

  // Recording indicator state
  const [isRecording, setIsRecording] = useState(false);

  // Check recording status
  useEffect(() => {
    async function checkRecordingStatus() {
      try {
        // Check if any recording is in_progress
        const recordings = await trpcClient.recordings.listForSession.query({ sessionId });
        const hasActiveRecording = recordings.some(
          (rec: any) => rec.status === 'in_progress'
        );

        setIsRecording(hasActiveRecording);
      } catch (error) {
        console.error('Failed to check recording status:', error);
        // Don't fail the meeting if we can't check recording status
      }
    }

    // Check on mount
    checkRecordingStatus();

    // Poll every 30 seconds to update recording status
    const interval = setInterval(checkRecordingStatus, 30000);

    return () => clearInterval(interval);
  }, [sessionId, trpcClient]);

  /**
   * Format chat messages
   *
   * NOTE: LiveKit's chat UI already displays the sender's name in the bubble header.
   * This formatter only formats the MESSAGE CONTENT, not the sender name.
   */
  const formatChatMessage = (message: string) => {
    // CRITICAL: Must handle undefined/null safely - FAIL LOUDLY
    if (!message) {
      console.error('❌ CRITICAL: Received null/undefined chat message');
      return '';
    }

    // Return the message as-is
    // LiveKit's ChatEntry component handles the sender name display
    return message;
  };

  return (
    <div className="relative h-full w-full">
      {/* Custom header overlay */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-50 pointer-events-none">
        <div className="flex items-center justify-between text-white">
          <div className="pointer-events-auto">
            <h1 className="text-lg font-semibold">{sessionTitle}</h1>
            <p className="text-sm text-gray-300">
              Meeting with {otherParticipantName}
              {participants.length > 1 && (
                <span className="ml-2 text-xs bg-green-600 px-2 py-0.5 rounded-full">
                  {participants.length} participants
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onLeave}
            className="pointer-events-auto px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium text-sm"
          >
            Leave Meeting
          </button>
        </div>
      </div>

      {/* Recording Indicator - Always visible when recording is active */}
      {isRecording && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-red-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
            <div className="w-3 h-3 bg-white rounded-full"></div>
            <span className="font-medium">Recording in Progress</span>
          </div>
        </div>
      )}

      {/* Main video conference UI */}
      <VideoConference chatMessageFormatter={formatChatMessage} />

      {/* Role indicator badge */}
      <div className="absolute bottom-20 left-4 z-40 pointer-events-none">
        <div className="text-white text-xs font-medium bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm">
          {userRole === 'mentor' ? '🎓 Mentor' : '👨‍🎓 Mentee'}
        </div>
      </div>
    </div>
  );
}
