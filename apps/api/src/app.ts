import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { config } from './config';
import { registerErrorHandler } from './core/errors';
import { loggerOptions } from './core/logger';
import { resolveAuth } from './core/rbac';
import { redis } from './core/redis';
import { db } from './db/client';
import { adminRoutes } from './modules/admin/routes';
import { analyticsRoutes } from './modules/analytics/routes';
import { authRoutes } from './modules/auth/routes';
import { geoRoutes } from './modules/geo/routes';
import { issueRoutes } from './modules/issues/routes';
import { manageRoutes } from './modules/manage/routes';
import { meRoutes } from './modules/me/routes';
import { notificationRoutes, pushRoutes } from './modules/notifications/routes';
import { referenceRoutes } from './modules/reference/routes';
import { maxUploadBytes } from './modules/uploads/service';
import { uploadRoutes } from './modules/uploads/routes';

export async function buildApp() {
  if (config.JOBS_MODE === 'inline') await import('./jobs');

  const app = Fastify({
    logger: loggerOptions,
    trustProxy: config.TRUST_PROXY,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  app.decorateRequest('auth', null);
  // Resolve the caller before rate limiting so limits can be keyed per user.
  app.addHook('onRequest', resolveAuth);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, {
    // JSON API: CSP only matters for the Swagger UI page; images must be embeddable by the web origin.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true, maxAge: 600 });
  await app.register(cookie);
  if (config.RATE_LIMIT_ENABLED)
    await app.register(rateLimit, {
      global: true,
      max: config.RATE_LIMIT_MAX,
      timeWindow: '1 minute',
      redis,
      nameSpace: 'uf:rl:',
      skipOnError: true,
      keyGenerator: (req) => req.auth?.id ?? req.ip,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      }),
    });
  await app.register(multipart, { limits: { fileSize: maxUploadBytes(), files: 1, fields: 5, parts: 6 } });

  if (config.STORAGE_DRIVER === 'local') {
    mkdirSync(config.UPLOAD_DIR, { recursive: true });
    await app.register(fastifyStatic, {
      root: config.UPLOAD_DIR,
      prefix: '/uploads/',
      decorateReply: false,
      immutable: true,
      maxAge: '365d',
      index: false,
      setHeaders: (res) => res.header('x-content-type-options', 'nosniff'),
    });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'UrbanFix API',
        version: '1.0.0',
        description: 'Civic issue reporting: citizens report, officials resolve, the community verifies.',
      },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.get('/healthz', { logLevel: 'warn', schema: { hide: true } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { logLevel: 'warn', schema: { hide: true } }, async (_req, reply) => {
    try {
      await Promise.all([db.execute(sql`SELECT 1`), redis.ping()]);
      return { status: 'ready' };
    } catch (err) {
      return reply.status(503).send({ status: 'unavailable', error: (err as Error).message });
    }
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(referenceRoutes);
      await api.register(geoRoutes, { prefix: '/geo' });
      await api.register(uploadRoutes, { prefix: '/uploads' });
      await api.register(issueRoutes, { prefix: '/issues' });
      await api.register(meRoutes, { prefix: '/me' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(pushRoutes, { prefix: '/push' });
      await api.register(manageRoutes, { prefix: '/manage' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
