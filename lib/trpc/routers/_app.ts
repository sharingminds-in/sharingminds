import { createTRPCRouter } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { analyticsRouter } from './analytics';
import { bookingsRouter } from './bookings';
import { chatbotRouter } from './chatbot';
import { contentRouter } from './content';
import { learningRouter } from './learning';
import { messagingRouter } from './messaging';
import { mentorRouter } from './mentor';
import { notificationsRouter } from './notifications';
import { paymentsRouter } from './payments';
import { publicRouter } from './public';
import { profileRouter } from './profile';
import { recordingsRouter } from './recordings';
import { subscriptionsRouter } from './subscriptions';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  bookings: bookingsRouter,
  chatbot: chatbotRouter,
  content: contentRouter,
  learning: learningRouter,
  messaging: messagingRouter,
  mentor: mentorRouter,
  notifications: notificationsRouter,
  payments: paymentsRouter,
  public: publicRouter,
  profile: profileRouter,
  recordings: recordingsRouter,
  subscriptions: subscriptionsRouter,
});

export type AppRouter = typeof appRouter;
