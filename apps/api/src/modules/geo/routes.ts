import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { reverseGeocodeQuery } from '@urbanfix/shared';
import { reverseGeocode } from './service';

export const geoRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/reverse',
    {
      schema: { tags: ['geo'], querystring: reverseGeocodeQuery },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const result = await reverseGeocode(req.query.lat, req.query.lng);
      return result ?? { address: null, components: {} };
    },
  );
};
