import {
  AudioCodec,
  EncodingOptions,
  EncodingOptionsPreset,
  VideoCodec,
} from 'livekit-server-sdk';

export type RecordingQuality = 'low' | 'standard' | 'high';

export interface RecordingEncodingConfig {
  quality?: RecordingQuality | string;
  resolution?: string;
  fps?: number;
  bitrate?: number;
  audioBitrate?: number;
}

interface ResolvedRecordingEncodingConfig {
  resolution: string;
  fps: number;
  bitrate?: number;
  audioBitrate?: number;
}

interface Dimensions {
  width: number;
  height: number;
}

const LOW_QUALITY_DEFAULTS = {
  resolution: '640x360',
  fps: 15,
  bitrate: 600,
  audioBitrate: 64,
} as const;

const STANDARD_QUALITY_DEFAULTS = {
  resolution: '1280x720',
  fps: 30,
} as const;

const HIGH_QUALITY_DEFAULTS = {
  resolution: '1920x1080',
  fps: 30,
} as const;

export function resolveRecordingEncodingOptions(
  recordingConfig: RecordingEncodingConfig
): EncodingOptionsPreset | EncodingOptions {
  const config = applyQualityDefaults(recordingConfig);
  const dimensions = parseResolution(config.resolution);
  const fps = validateIntegerRange(config.fps, 'recording_config.fps', 1, 60);

  if (!shouldUseCustomEncoding(config, dimensions, fps)) {
    return resolvePreset(dimensions, fps);
  }

  const videoBitrate = validateIntegerRange(
    config.bitrate ?? defaultVideoBitrateKbps(dimensions),
    'recording_config.bitrate',
    100,
    10_000
  );
  const audioBitrate = validateIntegerRange(
    config.audioBitrate ?? defaultAudioBitrateKbps(videoBitrate),
    'recording_config.audioBitrate',
    16,
    256
  );

  return new EncodingOptions({
    width: dimensions.width,
    height: dimensions.height,
    framerate: fps,
    audioCodec: AudioCodec.OPUS,
    audioBitrate,
    audioFrequency: 48_000,
    videoCodec: VideoCodec.H264_MAIN,
    videoBitrate,
  });
}

function applyQualityDefaults(
  recordingConfig: RecordingEncodingConfig
): ResolvedRecordingEncodingConfig {
  const quality = normalizeQuality(recordingConfig.quality);
  const defaults =
    quality === 'low'
      ? LOW_QUALITY_DEFAULTS
      : quality === 'high'
        ? HIGH_QUALITY_DEFAULTS
        : STANDARD_QUALITY_DEFAULTS;

  return {
    resolution: recordingConfig.resolution || defaults.resolution,
    fps: recordingConfig.fps ?? defaults.fps,
    bitrate:
      recordingConfig.bitrate ??
      ('bitrate' in defaults ? defaults.bitrate : undefined),
    audioBitrate:
      recordingConfig.audioBitrate ??
      ('audioBitrate' in defaults ? defaults.audioBitrate : undefined),
  };
}

function normalizeQuality(value: RecordingEncodingConfig['quality']): RecordingQuality {
  if (!value) {
    return 'standard';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'standard' || normalized === 'high') {
    return normalized;
  }

  throw new Error(
    `CRITICAL: recording_config.quality must be "low", "standard", or "high", received "${value}".`
  );
}

function parseResolution(resolution: string): Dimensions {
  const match = resolution.trim().toLowerCase().match(/^(\d{3,4})x(\d{3,4})$/);
  if (!match) {
    throw new Error(
      `CRITICAL: recording_config.resolution must use WIDTHxHEIGHT format, received "${resolution}".`
    );
  }

  const width = validateIntegerRange(
    Number(match[1]),
    'recording_config.resolution.width',
    160,
    3840
  );
  const height = validateIntegerRange(
    Number(match[2]),
    'recording_config.resolution.height',
    120,
    2160
  );

  return { width, height };
}

function validateIntegerRange(
  value: number,
  fieldName: string,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `CRITICAL: ${fieldName} must be an integer between ${min} and ${max}, received "${value}".`
    );
  }

  return value;
}

function shouldUseCustomEncoding(
  config: ResolvedRecordingEncodingConfig,
  dimensions: Dimensions,
  fps: number
): boolean {
  return (
    config.bitrate !== undefined ||
    config.audioBitrate !== undefined ||
    !isPresetResolution(dimensions) ||
    (fps !== 30 && fps !== 60)
  );
}

function isPresetResolution({ width, height }: Dimensions): boolean {
  return (
    (width === 1280 && height === 720) ||
    (width === 1920 && height === 1080) ||
    (width === 720 && height === 1280) ||
    (width === 1080 && height === 1920)
  );
}

function resolvePreset(
  dimensions: Dimensions,
  fps: number
): EncodingOptionsPreset {
  const { width, height } = dimensions;
  const isPortrait = height > width;
  const is1080p =
    (width === 1920 && height === 1080) ||
    (width === 1080 && height === 1920);
  const is60fps = fps >= 60;

  if (isPortrait && is1080p) {
    return is60fps
      ? EncodingOptionsPreset.PORTRAIT_H264_1080P_60
      : EncodingOptionsPreset.PORTRAIT_H264_1080P_30;
  }

  if (isPortrait) {
    return is60fps
      ? EncodingOptionsPreset.PORTRAIT_H264_720P_60
      : EncodingOptionsPreset.PORTRAIT_H264_720P_30;
  }

  if (is1080p) {
    return is60fps
      ? EncodingOptionsPreset.H264_1080P_60
      : EncodingOptionsPreset.H264_1080P_30;
  }

  return is60fps
    ? EncodingOptionsPreset.H264_720P_60
    : EncodingOptionsPreset.H264_720P_30;
}

function defaultVideoBitrateKbps({ width, height }: Dimensions): number {
  const pixels = width * height;

  if (pixels <= 640 * 360) {
    return 600;
  }

  if (pixels <= 854 * 480) {
    return 1_000;
  }

  if (pixels <= 1280 * 720) {
    return 1_500;
  }

  return 2_500;
}

function defaultAudioBitrateKbps(videoBitrateKbps: number): number {
  return videoBitrateKbps <= 700 ? 64 : 96;
}
