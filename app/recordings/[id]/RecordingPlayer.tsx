/**
 * Recording Player - Client Component
 *
 * Production-grade video player with:
 * - Secure playback URL fetching
 * - HTML5 video player with native controls
 * - Download functionality
 * - Error handling and retry logic
 * - Loading states
 * - Session information display
 *
 * Security: Playback URL fetched from server API (signed, temporary)
 */

'use client';

import { useState, useEffect } from 'react';
import { useTRPCClient } from '@/lib/trpc/react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Props {
  recordingId: string;
  sessionTitle: string;
  durationSeconds: number;
  fileSizeBytes: number;
  recordedAt: Date;
}

// ============================================================================
// RECORDING PLAYER COMPONENT
// ============================================================================

export default function RecordingPlayer({
  recordingId,
  sessionTitle,
  durationSeconds,
  fileSizeBytes,
  recordedAt,
}: Props) {
  const trpcClient = useTRPCClient();
  // State management
  const [playbackUrl, setPlaybackUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  // ==========================================================================
  // FETCH PLAYBACK URL
  // ==========================================================================
  useEffect(() => {
    let isMounted = true;

    async function fetchPlaybackUrl() {
      try {
        console.log(`🎥 Fetching playback URL for recording ${recordingId}`);

        const data = await trpcClient.recordings.playbackUrl.query({ recordingId });

        if (!isMounted) return;

        if (!data.playbackUrl) {
          throw new Error('Invalid response from server - no playback URL');
        }

        setPlaybackUrl(data.playbackUrl);
        setIsLoading(false);

        console.log(`✅ Playback URL obtained (expires at ${data.expiresAt})`);
      } catch (err) {
        console.error('❌ Error fetching playback URL:', err);

        if (!isMounted) return;

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load recording';

        setError(errorMessage);
        setIsLoading(false);
      }
    }

    fetchPlaybackUrl();

    return () => {
      isMounted = false;
    };
  }, [recordingId, retryCount, trpcClient]);

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  const handleRetry = () => {
    console.log('🔄 Retrying playback URL fetch...');
    setError('');
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  const handleDownload = () => {
    if (playbackUrl) {
      const link = document.createElement('a');
      link.href = playbackUrl;
      link.download = `${sessionTitle}.mp4`;
      link.click();
    }
  };

  // ==========================================================================
  // FORMAT HELPERS
  // ==========================================================================

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-xl font-medium">Loading recording...</p>
          <p className="text-sm text-gray-400 mt-2">Generating secure playback URL</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // ERROR STATE
  // ==========================================================================
  if (error || !playbackUrl) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        <div className="text-center max-w-md p-8">
          <div className="text-red-500 text-6xl mb-6">⚠️</div>
          <h2 className="text-3xl font-bold mb-4">Failed to Load Recording</h2>
          <p className="text-gray-300 mb-6">{error || 'Unable to load recording'}</p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Retry
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
            >
              Go Back
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
  // VIDEO PLAYER UI
  // ==========================================================================
  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 text-white">
        <h1 className="text-4xl font-bold mb-3">{sessionTitle}</h1>
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">📅</span>
            <span>Recorded: {formatDate(recordedAt)}</span>
          </div>
          <span className="text-gray-600">•</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">⏱️</span>
            <span>Duration: {formatDuration(durationSeconds)}</span>
          </div>
          <span className="text-gray-600">•</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">💾</span>
            <span>Size: {formatFileSize(fileSizeBytes)}</span>
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="bg-black rounded-lg overflow-hidden shadow-2xl mb-6">
        <video
          controls
          className="w-full"
          src={playbackUrl}
          preload="metadata"
          controlsList="nodownload" // Disable browser's default download (we have our own button)
        >
          <p className="text-white p-4">
            Your browser does not support the video tag. Please try a different browser.
          </p>
        </video>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <button
          onClick={handleDownload}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2"
        >
          <span>⬇️</span>
          Download Recording
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium"
        >
          Back to Dashboard
        </button>
      </div>

      {/* URL Expiration Notice */}
      <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200">
        <p className="text-sm">
          <strong>Note:</strong> For security, this playback URL expires in 1 hour.
          If the video stops playing, refresh the page to generate a new URL.
        </p>
      </div>
    </div>
  );
}
