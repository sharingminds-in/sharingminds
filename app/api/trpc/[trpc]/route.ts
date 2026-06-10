import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/lib/trpc/context';
import { appRouter } from '@/lib/trpc/routers/_app';

const NOISY_CLIENT_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
]);

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: req.headers,
        req,
      }),
    onError({ error, path }) {
      if (
        process.env.NODE_ENV !== 'production' &&
        !NOISY_CLIENT_ERROR_CODES.has(error.code)
      ) {
        console.error(`tRPC failed on ${path ?? '<unknown-path>'}:`, error);
      }
    },
  });

export { handler as GET, handler as POST };
