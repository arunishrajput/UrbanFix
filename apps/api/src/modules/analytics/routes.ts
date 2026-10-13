import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { analyticsQuery } from '@urbanfix/shared';
import { authOf, requireMunicipal } from '../../core/rbac';
import * as svc from './service';

export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireMunicipal);
  const schema = { tags: ['analytics'], querystring: analyticsQuery };

  app.get('/overview', { schema }, (req) => svc.overview(svc.resolveRange(req.query, authOf(req))));
  app.get('/reports-per-day', { schema }, async (req) => ({
    items: await svc.reportsPerDay(svc.resolveRange(req.query, authOf(req))),
  }));
  app.get('/resolution-time', { schema }, (req) =>
    svc.resolutionTime(svc.resolveRange(req.query, authOf(req))),
  );
  app.get('/categories', { schema }, async (req) => ({
    items: await svc.categoriesBreakdown(svc.resolveRange(req.query, authOf(req))),
  }));
  app.get('/wards', { schema }, async (req) => ({
    items: await svc.wardsBreakdown(svc.resolveRange(req.query, authOf(req))),
  }));
  app.get('/participation', { schema }, async (req) => ({
    items: await svc.participation(svc.resolveRange(req.query, authOf(req))),
  }));
};
