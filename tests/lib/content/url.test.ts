import { describe, expect, it } from 'vitest';

import {
  normalizeExternalUrl,
  parseExternalUrl,
  isValidExternalUrl,
  resolveUrlContentDetails,
} from '@/lib/content/url';

describe('content URL helpers', () => {
  it('preserves fully qualified http and https URLs', () => {
    expect(normalizeExternalUrl('https://youtube.com/watch?v=abc123')).toBe(
      'https://youtube.com/watch?v=abc123'
    );
    expect(normalizeExternalUrl('http://example.com/article')).toBe(
      'http://example.com/article'
    );
  });

  it('adds https to protocol-less URLs', () => {
    expect(normalizeExternalUrl('example.com')).toBe('https://example.com');
    expect(normalizeExternalUrl('www.example.com/path?x=1')).toBe(
      'https://www.example.com/path?x=1'
    );
  });

  it('trims whitespace before validation', () => {
    expect(parseExternalUrl('  https://example.com/resource  ')).toEqual({
      success: true,
      url: 'https://example.com/resource',
    });
  });

  it('rejects empty and unsupported URLs', () => {
    expect(isValidExternalUrl('')).toBe(false);
    expect(isValidExternalUrl('not a url')).toBe(false);
    expect(isValidExternalUrl('ftp://example.com/file')).toBe(false);
  });

  it('uses URL-specific title and description when root content fields are empty', () => {
    const resolved = resolveUrlContentDetails({
      title: '',
      description: '',
      url: 'youtube.com/u/123',
      urlTitle: 'YouTube channel',
      urlDescription: 'A useful channel for mentees',
    });

    expect(resolved).toEqual({
      success: true,
      title: 'YouTube channel',
      description: 'A useful channel for mentees',
      url: 'https://youtube.com/u/123',
    });
  });

  it('falls back to the normalized URL as title when no display title is provided', () => {
    const resolved = resolveUrlContentDetails({
      title: '',
      url: 'youtube.com/u/123',
      urlTitle: '',
    });

    expect(resolved).toEqual({
      success: true,
      title: 'https://youtube.com/u/123',
      description: '',
      url: 'https://youtube.com/u/123',
    });
  });
});
