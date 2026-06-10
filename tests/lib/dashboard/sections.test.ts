import { describe, expect, it } from 'vitest';
import {
  buildDashboardSectionUrl,
  getNavigationSections,
  getDashboardSection,
  isSectionAvailableForAudience,
  resolveDashboardSection,
} from '@/lib/dashboard/sections';

describe('dashboard section registry', () => {
  it('registers messages as a workspace section', () => {
    expect(getDashboardSection('messages')).toMatchObject({
      key: 'messages',
      shellMode: 'workspace',
    });
    expect(getDashboardSection('chat')).toMatchObject({
      key: 'chat',
      shellMode: 'workspace',
      audiences: ['mentee'],
    });
    expect(getDashboardSection('notifications')).toMatchObject({
      key: 'notifications',
      shellMode: 'page',
      navigation: false,
    });
    expect(getDashboardSection('sessions')).toMatchObject({
      key: 'sessions',
      shellMode: 'page',
    });
  });

  it('exposes home only for mentee root navigation', () => {
    expect(isSectionAvailableForAudience('home', 'mentee', 'root')).toBe(true);
    expect(isSectionAvailableForAudience('home', 'mentee', 'dashboard')).toBe(
      false
    );
    expect(isSectionAvailableForAudience('home', 'mentor', 'root')).toBe(false);
  });

  it('rejects unsupported sections and falls back deterministically', () => {
    expect(resolveDashboardSection('home', 'mentee', 'dashboard', 'dashboard')).toBe(
      'dashboard'
    );
    expect(
      resolveDashboardSection('settings', 'mentor', 'dashboard', 'dashboard')
    ).toBe('settings');
    expect(
      resolveDashboardSection('messages', 'admin', 'dashboard', 'dashboard')
    ).toBe('messages');
  });

  it('returns navigation sections filtered by audience and scope', () => {
    const mentorDashboardSections = getNavigationSections('mentor', 'dashboard');
    const mentorKeys = mentorDashboardSections.map((section) => section.key);

    expect(mentorKeys).toContain('messages');
    expect(mentorKeys).toContain('reviews');
    expect(mentorKeys).toContain('settings');
    expect(mentorKeys).not.toContain('earnings');

    const menteeDashboardSections = getNavigationSections('mentee', 'dashboard');
    const menteeKeys = menteeDashboardSections.map((section) => section.key);
    expect(menteeKeys).toContain('chat');
    expect(menteeKeys).toContain('settings');
    expect(menteeKeys).not.toContain('home');
  });

  it('builds standardized dashboard section urls from one helper', () => {
    expect(buildDashboardSectionUrl('/dashboard', 'messages', { thread: 'thread-123' })).toBe(
      '/dashboard?section=messages&thread=thread-123'
    );
    expect(buildDashboardSectionUrl('/', 'home')).toBe('/?section=home');
  });
});
