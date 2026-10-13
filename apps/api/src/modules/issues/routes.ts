import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createIssueSchema,
  duplicateCheckSchema,
  idParams,
  joinIssueSchema,
  listIssuesQuery,
  mapQuery,
  nearbyQuery,
  verificationResponseSchema,
} from '@urbanfix/shared';
import { authOf, requireAuth } from '../../core/rbac';
import { checkDuplicates, draftPhotosFor } from '../duplicates/service';
import { respond } from '../verification/service';
import {
  heatPoints,
  listIssues,
  loadIssueDetail,
  mapPoints,
  nearbyIssues,
  reportsForIssue,
  timeline,
} from './repo';
import { createIssue, joinIssue, setSupport } from './service';

/** Guests get a tighter budget for creating issues than registered citizens. */
const createLimit = {
  rateLimit: {
    max: (req: { auth: { isGuest: boolean } | null }) => (req.auth?.isGuest ? 5 : 20),
    timeWindow: '1 hour',
    keyGenerator: (req: { auth: { id: string } | null; ip: string }) => req.auth?.id ?? req.ip,
  },
};

export const issueRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { tags: ['issues'], querystring: listIssuesQuery } }, (req) =>
    listIssues(req.query),
  );

  app.get('/map', { schema: { tags: ['issues'], querystring: mapQuery } }, (req) => mapPoints(req.query));

  app.get('/heatmap', { schema: { tags: ['issues'], querystring: mapQuery } }, async (req) => ({
    points: await heatPoints(req.query),
  }));

  app.get('/nearby', { schema: { tags: ['issues'], querystring: nearbyQuery } }, async (req) => ({
    items: await nearbyIssues(req.query.lat, req.query.lng, req.query.radiusM, req.query.limit),
  }));

  app.post(
    '/duplicates/check',
    {
      schema: { tags: ['issues'], body: duplicateCheckSchema },
      preHandler: requireAuth,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = authOf(req);
      return checkDuplicates({
        ...req.body,
        photos: await draftPhotosFor(auth.id, req.body.uploadIds),
        userId: auth.id,
      });
    },
  );

  app.post(
    '/',
    { schema: { tags: ['issues'], body: createIssueSchema }, preHandler: requireAuth, config: createLimit },
    async (req, reply) => reply.status(201).send(await createIssue(authOf(req), req.body)),
  );

  app.get('/:id', { schema: { tags: ['issues'], params: idParams } }, (req) =>
    loadIssueDetail(req.params.id, req.auth),
  );

  app.get('/:id/timeline', { schema: { tags: ['issues'], params: idParams } }, async (req) => ({
    items: await timeline(req.params.id, req.auth),
  }));

  app.get('/:id/reports', { schema: { tags: ['issues'], params: idParams } }, async (req) => ({
    items: await reportsForIssue(req.params.id, req.auth),
  }));

  app.post(
    '/:id/join',
    {
      schema: { tags: ['issues'], params: idParams, body: joinIssueSchema },
      preHandler: requireAuth,
      config: createLimit,
    },
    (req) => joinIssue(authOf(req), req.params.id, req.body),
  );

  app.post(
    '/:id/support',
    { schema: { tags: ['issues'], params: idParams }, preHandler: requireAuth },
    (req) => setSupport(authOf(req), req.params.id, true),
  );

  app.delete(
    '/:id/support',
    { schema: { tags: ['issues'], params: idParams }, preHandler: requireAuth },
    (req) => setSupport(authOf(req), req.params.id, false),
  );

  app.post(
    '/:id/verification',
    {
      schema: { tags: ['issues'], params: idParams, body: verificationResponseSchema },
      preHandler: requireAuth,
    },
    async (req) => {
      const auth = authOf(req);
      const result = await respond(auth, req.params.id, req.body);
      return { ...result, issue: await loadIssueDetail(req.params.id, auth) };
    },
  );
};
