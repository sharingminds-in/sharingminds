import { describe, expect, it } from 'vitest';
import { EncodingOptions, EncodingOptionsPreset } from 'livekit-server-sdk';

import { resolveRecordingEncodingOptions } from '@/lib/livekit/recording-encoding';

describe('recording encoding options', () => {
  it('keeps the standard 720p preset when no custom quality is requested', () => {
    expect(
      resolveRecordingEncodingOptions({
        resolution: '1280x720',
        fps: 30,
      })
    ).toBe(EncodingOptionsPreset.H264_720P_30);
  });

  it('uses custom low-quality video encoding for low quality recordings', () => {
    const options = resolveRecordingEncodingOptions({ quality: 'low' });

    expect(options).toBeInstanceOf(EncodingOptions);
    expect(options).toMatchObject({
      width: 640,
      height: 360,
      framerate: 15,
      videoBitrate: 600,
      audioBitrate: 64,
    });
  });

  it('uses custom encoding when bitrate is explicitly configured', () => {
    const options = resolveRecordingEncodingOptions({
      resolution: '854x480',
      fps: 15,
      bitrate: 800,
      audioBitrate: 64,
    });

    expect(options).toBeInstanceOf(EncodingOptions);
    expect(options).toMatchObject({
      width: 854,
      height: 480,
      framerate: 15,
      videoBitrate: 800,
      audioBitrate: 64,
    });
  });

  it('fails loudly for malformed recording quality config', () => {
    expect(() =>
      resolveRecordingEncodingOptions({
        quality: 'tiny',
      })
    ).toThrow('recording_config.quality');

    expect(() =>
      resolveRecordingEncodingOptions({
        resolution: '360p',
      })
    ).toThrow('recording_config.resolution');
  });
});
