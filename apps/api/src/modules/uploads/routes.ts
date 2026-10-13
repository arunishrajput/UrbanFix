import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams, uploadQuerySchema } from '@urbanfix/shared';
import { badRequest } from '../../core/errors';
import { authOf, requireAuth } from '../../core/rbac';
import { createUpload, getUpload } from './service';

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    {
      schema: { tags: ['uploads'], querystring: uploadQuerySchema, consumes: ['multipart/form-data'] },
      preHandler: requireAuth,
      config: {
        rateLimit: { max: 40, timeWindow: '10 minutes', keyGenerator: (req) => req.auth?.id ?? req.ip },
      },
    },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw badRequest('Attach a photo in the "file" field');
      const buffer = await file.toBuffer();
      return reply.status(201).send(await createUpload(authOf(req), buffer, req.query.kind));
    },
  );

  app.get('/:id', { schema: { tags: ['uploads'], params: idParams }, preHandler: requireAuth }, (req) =>
    getUpload(authOf(req), req.params.id),
  );
};
