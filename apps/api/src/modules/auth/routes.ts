import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { guestSchema, loginSchema, registerSchema, upgradeGuestSchema } from '@urbanfix/shared';
import { AppError } from '../../core/errors';
import { authOf, requireAuth } from '../../core/rbac';
import * as auth from './service';

const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/** Refresh/logout rely on a cookie, so they also require a custom header that cross-site forms can't send. */
const csrfGuard = async (request: { headers: Record<string, unknown> }) => {
  if (request.headers['x-requested-with'] !== 'urbanfix') {
    throw new AppError(403, 'CSRF', 'Missing X-Requested-With header');
  }
};

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    { schema: { tags: ['auth'], body: registerSchema }, config: authRateLimit },
    async (req, reply) => reply.status(201).send(await auth.register(req.body, req, reply)),
  );

  app.post('/login', { schema: { tags: ['auth'], body: loginSchema }, config: authRateLimit }, (req, reply) =>
    auth.login(req.body, req, reply),
  );

  app.post(
    '/guest',
    { schema: { tags: ['auth'], body: guestSchema.optional() }, config: authRateLimit },
    async (req, reply) => reply.status(201).send(await auth.createGuest(req.body?.name, req, reply)),
  );

  app.post(
    '/refresh',
    {
      schema: { tags: ['auth'] },
      preHandler: csrfGuard,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    (req, reply) => auth.refresh(req, reply),
  );

  app.post('/logout', { schema: { tags: ['auth'] }, preHandler: csrfGuard }, async (req, reply) => {
    await auth.logout(req, reply);
    return reply.status(204).send();
  });

  app.post(
    '/upgrade',
    { schema: { tags: ['auth'], body: upgradeGuestSchema }, preHandler: requireAuth, config: authRateLimit },
    (req, reply) => auth.upgradeGuest(authOf(req).id, req.body, req, reply),
  );

  app.get('/me', { schema: { tags: ['auth'] }, preHandler: requireAuth }, (req) =>
    auth.getMe(authOf(req).id),
  );
};
