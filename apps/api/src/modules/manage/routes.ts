import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  assignSchema,
  idParams,
  manageListQuery,
  mergeSchema,
  noteSchema,
  patchIssueSchema,
  statusChangeSchema,
  workPhotosSchema,
} from '@urbanfix/shared';
import { authOf, requireMunicipal, requireTriage } from '../../core/rbac';
import * as svc from './service';

export const manageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireMunicipal);

  app.get('/issues', { schema: { tags: ['manage'], querystring: manageListQuery } }, (req) =>
    svc.listManagedIssues(authOf(req), req.query),
  );

  app.get('/issues/:id', { schema: { tags: ['manage'], params: idParams } }, (req) =>
    svc.managedIssueDetail(authOf(req), req.params.id),
  );

  app.post(
    '/issues/:id/assign',
    { schema: { tags: ['manage'], params: idParams, body: assignSchema }, preHandler: requireTriage },
    (req) => svc.assignIssue(authOf(req), req.params.id, req.body.assigneeId, req),
  );

  app.post(
    '/issues/:id/status',
    { schema: { tags: ['manage'], params: idParams, body: statusChangeSchema } },
    (req) => svc.changeStatus(authOf(req), req.params.id, req.body, req),
  );

  app.patch(
    '/issues/:id',
    { schema: { tags: ['manage'], params: idParams, body: patchIssueSchema }, preHandler: requireTriage },
    (req) => svc.patchIssue(authOf(req), req.params.id, req.body, req),
  );

  app.get('/issues/:id/notes', { schema: { tags: ['manage'], params: idParams } }, async (req) => ({
    items: await svc.listNotes(authOf(req), req.params.id),
  }));

  app.post(
    '/issues/:id/notes',
    { schema: { tags: ['manage'], params: idParams, body: noteSchema } },
    async (req) => ({
      items: await svc.addNote(authOf(req), req.params.id, req.body.body),
    }),
  );

  app.post(
    '/issues/:id/work-photos',
    { schema: { tags: ['manage'], params: idParams, body: workPhotosSchema } },
    (req) => svc.addWorkPhotos(authOf(req), req.params.id, req.body.uploadIds, req.body.note),
  );

  app.post(
    '/issues/:id/merge',
    { schema: { tags: ['manage'], params: idParams, body: mergeSchema }, preHandler: requireTriage },
    (req) => svc.mergeIssues(authOf(req), req.params.id, req.body.targetIssueId, req),
  );

  app.get(
    '/staff',
    { schema: { tags: ['manage'], querystring: z.object({ wardId: z.uuid().optional() }) } },
    (req) => svc.listStaff(authOf(req), req.query.wardId),
  );

  app.get('/stats', { schema: { tags: ['manage'] } }, (req) => svc.manageStats(authOf(req)));
};
