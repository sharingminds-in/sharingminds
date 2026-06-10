import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_WORKSPACE_SECTIONS,
  getDashboardShellClassNames,
  getDashboardShellMode,
  isDashboardWorkspaceSection,
} from '@/lib/dashboard/shell-mode';

describe('dashboard shell mode', () => {
  it('treats configured workspace sections as workspace layouts', () => {
    expect(DASHBOARD_WORKSPACE_SECTIONS).toContain('messages');
    expect(DASHBOARD_WORKSPACE_SECTIONS).toContain('chat');
    expect(getDashboardShellMode('messages')).toBe('workspace');
    expect(getDashboardShellMode('chat')).toBe('workspace');
    expect(isDashboardWorkspaceSection('messages')).toBe(true);
    expect(isDashboardWorkspaceSection('chat')).toBe(true);
  });

  it('treats unknown or missing sections as page layouts', () => {
    expect(getDashboardShellMode('sessions')).toBe('page');
    expect(getDashboardShellMode(null)).toBe('page');
    expect(getDashboardShellMode(undefined)).toBe('page');
    expect(isDashboardWorkspaceSection('courses')).toBe(false);
  });

  it('returns viewport-lock classes for workspace layouts', () => {
    expect(getDashboardShellClassNames('workspace')).toEqual({
      shell: 'h-svh overflow-hidden',
      inset: 'h-svh overflow-hidden',
      main: 'overflow-hidden',
      content: 'min-h-0 overflow-hidden',
      section: 'flex h-full min-h-0 flex-1 overflow-hidden',
    });
  });

  it('returns document-flow classes for page layouts', () => {
    expect(getDashboardShellClassNames('page')).toEqual({
      shell: 'min-h-screen',
      inset: '',
      main: '',
      content: '',
      section: '',
    });
  });
});
