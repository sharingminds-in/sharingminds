export type DashboardAudience = 'admin' | 'mentor' | 'mentee';
export type DashboardNavigationScope = 'root' | 'dashboard';
export type DashboardShellMode = 'page' | 'workspace';
export type DashboardRouteBasePath = '/' | '/dashboard';

export type DashboardSectionKey =
  | 'home'
  | 'dashboard'
  | 'explore'
  | 'saved'
  | 'users'
  | 'mentors'
  | 'courses'
  | 'my-courses'
  | 'messages'
  | 'notifications'
  | 'sessions'
  | 'subscription'
  | 'profile'
  | 'mentor-detail'
  | 'mentees'
  | 'schedule'
  | 'availability'
  | 'content'
  | 'analytics'
  | 'reviews'
  | 'subscriptions'
  | 'enquiries'
  | 'settings';

export interface DashboardSectionDefinition {
  key: DashboardSectionKey;
  title: string;
  audiences: DashboardAudience[];
  scopes: DashboardNavigationScope[];
  shellMode: DashboardShellMode;
  navigation: boolean;
}

export const DASHBOARD_SECTIONS = [
  {
    key: 'home',
    title: 'Home',
    audiences: ['mentee'],
    scopes: ['root'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    audiences: ['admin', 'mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'explore',
    title: 'Explore Mentors',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'saved',
    title: 'Saved Items',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'users',
    title: 'Users',
    audiences: ['admin'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'mentors',
    title: 'Mentors',
    audiences: ['admin', 'mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'courses',
    title: 'Courses',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'my-courses',
    title: 'My Learning',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'messages',
    title: 'Messages',
    audiences: ['admin', 'mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'workspace',
    navigation: true,
  },
  {
    key: 'notifications',
    title: 'Notifications',
    audiences: ['admin', 'mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: false,
  },
  {
    key: 'sessions',
    title: 'Sessions',
    audiences: ['admin', 'mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'subscription',
    title: 'Subscription',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'profile',
    title: 'Profile',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'mentor-detail',
    title: 'Mentor Detail',
    audiences: ['mentor', 'mentee'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: false,
  },
  {
    key: 'mentees',
    title: 'Mentees',
    audiences: ['admin', 'mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'schedule',
    title: 'Schedule',
    audiences: ['mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'availability',
    title: 'Availability',
    audiences: ['mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'content',
    title: 'Content',
    audiences: ['admin', 'mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'analytics',
    title: 'Analytics',
    audiences: ['admin', 'mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'reviews',
    title: 'Reviews',
    audiences: ['mentor'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'subscriptions',
    title: 'Subscriptions',
    audiences: ['admin'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'enquiries',
    title: 'Enquiries',
    audiences: ['admin'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
  {
    key: 'settings',
    title: 'Settings',
    audiences: ['admin'],
    scopes: ['root', 'dashboard'],
    shellMode: 'page',
    navigation: true,
  },
] as const satisfies readonly DashboardSectionDefinition[];

const sectionMap = new Map<DashboardSectionKey, DashboardSectionDefinition>(
  DASHBOARD_SECTIONS.map((section) => [section.key, section])
);

export function getDashboardSection(
  key: string | null | undefined
): DashboardSectionDefinition | null {
  if (!key) {
    return null;
  }

  return sectionMap.get(key as DashboardSectionKey) ?? null;
}

export function isSectionAvailableForAudience(
  key: string | null | undefined,
  audience: DashboardAudience,
  scope: DashboardNavigationScope
): boolean {
  const section = getDashboardSection(key);
  if (!section) {
    return false;
  }

  return (
    section.audiences.includes(audience) &&
    section.scopes.includes(scope)
  );
}

export function resolveDashboardSection(
  key: string | null | undefined,
  audience: DashboardAudience,
  scope: DashboardNavigationScope,
  fallback: DashboardSectionKey
): DashboardSectionKey {
  if (isSectionAvailableForAudience(key, audience, scope)) {
    return key as DashboardSectionKey;
  }

  return fallback;
}

export function getNavigationSections(
  audience: DashboardAudience,
  scope: DashboardNavigationScope
) {
  const sections: readonly DashboardSectionDefinition[] = DASHBOARD_SECTIONS;

  return sections.filter(
    (section) =>
      section.navigation &&
      section.audiences.includes(audience) &&
      section.scopes.includes(scope)
  );
}

export function buildDashboardSectionUrl(
  basePath: DashboardRouteBasePath,
  section: DashboardSectionKey,
  params?: Record<string, string | null | undefined>
) {
  const searchParams = new URLSearchParams();
  searchParams.set('section', section);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  return `${basePath}?${searchParams.toString().replace(/\+/g, '%20')}`;
}
