import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams, notificationsQuery, pushSubscriptionSchema } from '@urbanfix/shared';
import { config } from '../../config';
import { authOf, requireAuth } from '../../core/rbac';
import * as svc from './service';

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/', { schema: { tags: ['notifications'], querystring: notificationsQuery } }, (req) =>
    svc.listNotifications(authOf(req).id, req.query),
  );

  app.get('/unread-count', { schema: { tags: ['notifications'] } }, async (req) => ({
    count: await svc.unreadCount(authOf(req).id),
  }));

  app.post('/:id/read', { schema: { tags: ['notifications'], params: idParams } }, async (req, reply) => {
    await svc.markRead(authOf(req).id, req.params.id);
    return reply.status(204).send();
  });

  app.post('/read-all', { schema: { tags: ['notifications'] } }, async (req, reply) => {
    await svc.markRead(authOf(req).id);
    return reply.status(204).send();
  });
};

export const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/vapid-key', { schema: { tags: ['notifications'] } }, async () => ({
    publicKey: config.pushAvailable ? config.VAPID_PUBLIC_KEY : null,
  }));

  app.post(
    '/subscribe',
    { schema: { tags: ['notifications'], body: pushSubscriptionSchema }, preHandler: requireAuth },
    async (req, reply) => {
      await svc.savePushSubscription(authOf(req).id, req.body);
      return reply.status(204).send();
    },
  );

  app.delete(
    '/subscribe',
    {
      schema: { tags: ['notifications'], body: z.object({ endpoint: z.string().max(1000) }) },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      await svc.deletePushSubscription(authOf(req).id, req.body.endpoint);
      return reply.status(204).send();
    },
  );
};
