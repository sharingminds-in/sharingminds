import { FEATURE_KEYS, type FeatureKey } from '@/lib/subscriptions/feature-keys';
import type { SubscriptionActorRole, SubscriptionAudience } from '@/lib/subscriptions/enforcement';

export type MeterDelta = {
  count?: number;
  minutes?: number;
  amount?: number;
};

export type SubscriptionPolicyAction =
  | 'booking.mentee.free_session'
  | 'booking.mentee.paid_session'
  | 'booking.mentee.counseling_session'
  | 'booking.mentor.session'
  | 'booking.mentor.duration'
  | 'messaging.direct_message.mentee'
  | 'messaging.direct_message.mentor'
  | 'messaging.request.mentee'
  | 'messaging.request.mentor'
  | 'ai.search.sessions'
  | 'ai.search.sessions_monthly'
  | 'mentor.ai.visibility'
  | 'ai.chat.access'
  | 'ai.chat.message'
  | 'ai.chat.max_user_messages'
  | 'courses.access'
  | 'courses.free_limit'
  | 'analytics.mentor'
  | 'analytics.mentee'
  | 'mentor.content_post'
  | 'mentor.roadmap_upload'
  | 'mentor.free_session_availability'
  | 'mentor.paid_session_availability'
  | 'recordings.access.mentor'
  | 'recordings.access.mentee';

export interface ActionPolicyDefinition {
  action: SubscriptionPolicyAction;
  featureKey: FeatureKey;
  audience: SubscriptionAudience;
  actorRole: SubscriptionActorRole;
  metered: boolean;
  defaultDelta?: MeterDelta;
  defaultResourceType?: string;
  defaultFailureMessage?: string;
}

export const ACTION_POLICIES: Record<SubscriptionPolicyAction, ActionPolicyDefinition> = {
  'booking.mentee.free_session': {
    action: 'booking.mentee.free_session',
    featureKey: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'You have reached your free session limit',
  },
  'booking.mentee.paid_session': {
    action: 'booking.mentee.paid_session',
    featureKey: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'You have reached your paid session limit',
  },
  'booking.mentee.counseling_session': {
    action: 'booking.mentee.counseling_session',
    featureKey: FEATURE_KEYS.COUNSELING_SESSIONS_MONTHLY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'You have reached your counseling session limit',
  },
  'booking.mentor.session': {
    action: 'booking.mentor.session',
    featureKey: FEATURE_KEYS.MENTOR_SESSIONS_MONTHLY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'Mentor has reached their monthly session limit',
  },
  'booking.mentor.duration': {
    action: 'booking.mentor.duration',
    featureKey: FEATURE_KEYS.SESSION_DURATION_MINUTES,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: false,
    defaultFailureMessage: 'Mentor session duration limit is not included in plan',
  },
  'messaging.direct_message.mentee': {
    action: 'messaging.direct_message.mentee',
    featureKey: FEATURE_KEYS.DIRECT_MESSAGES_DAILY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'message',
    defaultFailureMessage: 'Daily message limit reached. Upgrade your plan for more.',
  },
  'messaging.direct_message.mentor': {
    action: 'messaging.direct_message.mentor',
    featureKey: FEATURE_KEYS.DIRECT_MESSAGES_DAILY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'message',
    defaultFailureMessage: 'Daily message limit reached. Upgrade your plan for more.',
  },
  'messaging.request.mentee': {
    action: 'messaging.request.mentee',
    featureKey: FEATURE_KEYS.MESSAGE_REQUESTS_DAILY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'message_request',
    defaultFailureMessage: 'Daily request limit reached. Upgrade your plan for more.',
  },
  'messaging.request.mentor': {
    action: 'messaging.request.mentor',
    featureKey: FEATURE_KEYS.MESSAGE_REQUESTS_DAILY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'message_request',
    defaultFailureMessage: 'Daily request limit reached. Upgrade your plan for more.',
  },
  'ai.search.sessions': {
    action: 'ai.search.sessions',
    featureKey: FEATURE_KEYS.AI_SEARCH_SESSIONS,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'ai_search',
    defaultFailureMessage: 'AI search not included in your plan',
  },
  'ai.search.sessions_monthly': {
    action: 'ai.search.sessions_monthly',
    featureKey: FEATURE_KEYS.AI_SEARCH_SESSIONS_MONTHLY,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'ai_search',
    defaultFailureMessage: 'AI search not included in your plan',
  },
  'mentor.ai.visibility': {
    action: 'mentor.ai.visibility',
    featureKey: FEATURE_KEYS.AI_VISIBILITY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'mentor_profile',
    defaultFailureMessage: 'AI visibility is not included in your plan',
  },
  'ai.chat.access': {
    action: 'ai.chat.access',
    featureKey: FEATURE_KEYS.AI_HELPER_CHAT_ACCESS,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: false,
    defaultFailureMessage: 'AI Chat access is not included in your plan',
  },
  'ai.chat.message': {
    action: 'ai.chat.message',
    featureKey: FEATURE_KEYS.AI_HELPER_MESSAGES_LIMIT,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'chat_message',
    defaultFailureMessage: 'Message limit reached',
  },
  'ai.chat.max_user_messages': {
    action: 'ai.chat.max_user_messages',
    featureKey: FEATURE_KEYS.AI_CHAT_MAX_USER_MESSAGES,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'chat_message',
    defaultFailureMessage: 'Chat message limit reached',
  },
  'courses.access': {
    action: 'courses.access',
    featureKey: FEATURE_KEYS.COURSES_ACCESS,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: false,
    defaultFailureMessage: 'Courses are not included in your plan',
  },
  'courses.free_limit': {
    action: 'courses.free_limit',
    featureKey: FEATURE_KEYS.FREE_COURSES_LIMIT,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'course_enrollment',
    defaultFailureMessage: 'Course enrollment limit reached',
  },
  'analytics.mentor': {
    action: 'analytics.mentor',
    featureKey: FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: false,
    defaultFailureMessage: 'Analytics access not included in your plan',
  },
  'analytics.mentee': {
    action: 'analytics.mentee',
    featureKey: FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: false,
    defaultFailureMessage: 'Analytics access not included in your plan',
  },
  'mentor.content_post': {
    action: 'mentor.content_post',
    featureKey: FEATURE_KEYS.CONTENT_POSTING_ACCESS,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: false,
    defaultFailureMessage: 'Content publishing is not included in your plan',
  },
  'mentor.roadmap_upload': {
    action: 'mentor.roadmap_upload',
    featureKey: FEATURE_KEYS.ROADMAP_UPLOAD_ACCESS,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: false,
    defaultFailureMessage: 'Document uploads are not included in your plan',
  },
  'mentor.free_session_availability': {
    action: 'mentor.free_session_availability',
    featureKey: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'Mentor has reached their free session limit',
  },
  'mentor.paid_session_availability': {
    action: 'mentor.paid_session_availability',
    featureKey: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: true,
    defaultDelta: { count: 1 },
    defaultResourceType: 'session',
    defaultFailureMessage: 'Mentor has reached their paid session limit',
  },
  'recordings.access.mentor': {
    action: 'recordings.access.mentor',
    featureKey: FEATURE_KEYS.SESSION_RECORDINGS_ACCESS,
    audience: 'mentor',
    actorRole: 'mentor',
    metered: false,
    defaultFailureMessage: 'Session recordings are not included in your plan',
  },
  'recordings.access.mentee': {
    action: 'recordings.access.mentee',
    featureKey: FEATURE_KEYS.SESSION_RECORDINGS_ACCESS,
    audience: 'mentee',
    actorRole: 'mentee',
    metered: false,
    defaultFailureMessage: 'Session recordings are not included in your plan',
  },
};

export type MenteeSessionType = 'FREE' | 'PAID' | 'COUNSELING';

export function resolveMenteeBookingAction(sessionType: MenteeSessionType): SubscriptionPolicyAction {
  if (sessionType === 'FREE') {
    return 'booking.mentee.free_session';
  }
  if (sessionType === 'COUNSELING') {
    return 'booking.mentee.counseling_session';
  }
  return 'booking.mentee.paid_session';
}
