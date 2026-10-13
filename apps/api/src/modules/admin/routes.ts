import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminUsersQuery,
  auditQuery,
  categoryUpsertSchema,
  idParams,
  moderationDecisionSchema,
  moderationQuery,
  settingsSchema,
  wardUpsertSchema,
} from '@urbanfix/shared';
import { authOf, requireAdmin } from '../../core/rbac';
import { audit } from '../../lib/audit';
import { getSettings, saveSettings } from '../../lib/settings';
import { db } from '../../db/client';
import { listWards } from '../reference/routes';
import * as svc from './service';

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/users', { schema: { tags: ['admin'], querystring: adminUsersQuery } }, (req) =>
    svc.listUsers(req.query),
  );
  app.post('/users', { schema: { tags: ['admin'], body: adminCreateUserSchema } }, async (req, reply) =>
    reply.status(201).send(await svc.createUser(req.body, req)),
  );
  app.patch(
    '/users/:id',
    { schema: { tags: ['admin'], params: idParams, body: adminUpdateUserSchema } },
    (req) => svc.updateUser(authOf(req), req.params.id, req.body, req),
  );

  app.get('/categories', { schema: { tags: ['admin'] } }, () => svc.listAllCategories());
  app.post('/categories', { schema: { tags: ['admin'], body: categoryUpsertSchema } }, async (req, reply) =>
    reply.status(201).send(await svc.upsertCategory(null, req.body, req)),
  );
  app.put(
    '/categories/:id',
    { schema: { tags: ['admin'], params: idParams, body: categoryUpsertSchema } },
    (req) => svc.upsertCategory(req.params.id, req.body, req),
  );
  app.delete('/categories/:id', { schema: { tags: ['admin'], params: idParams } }, (req) =>
    svc.deleteCategory(req.params.id, req),
  );

  app.get('/wards', { schema: { tags: ['admin'] } }, () => listWards(true));
  app.post('/wards', { schema: { tags: ['admin'], body: wardUpsertSchema } }, async (req, reply) =>
    reply.status(201).send(await svc.upsertWard(null, req.body, req)),
  );
  app.put('/wards/:id', { schema: { tags: ['admin'], params: idParams, body: wardUpsertSchema } }, (req) =>
    svc.upsertWard(req.params.id, req.body, req),
  );

  app.get('/moderation', { schema: { tags: ['admin'], querystring: moderationQuery } }, (req) =>
    svc.moderationQueue(req.query),
  );
  app.post(
    '/moderation/:id/decision',
    { schema: { tags: ['admin'], params: idParams, body: moderationDecisionSchema } },
    async (req, reply) => {
      await svc.decideModeration(authOf(req), req.params.id, req.body.action, req.body.reason, req);
      return reply.status(204).send();
    },
  );

  app.get('/audit-logs', { schema: { tags: ['admin'], querystring: auditQuery } }, (req) =>
    svc.listAudit(req.query),
  );

  app.get('/settings', { schema: { tags: ['admin'] } }, () => getSettings());
  app.put('/settings', { schema: { tags: ['admin'], body: settingsSchema } }, async (req) => {
    await saveSettings(req.body, authOf(req).id);
    await audit(db, req, { action: 'settings.update', entityType: 'settings', diff: req.body });
    return getSettings();
  });
};
