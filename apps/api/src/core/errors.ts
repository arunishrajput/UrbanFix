import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

/** An error that is safe to show to the client. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

/** Paths that never fall back to the SPA's index.html. */
const NON_SPA_PATH = /^\/(api|uploads|socket\.io)(\/|\?|$)/;

export function registerErrorHandler(app: FastifyInstance, opts: { spaFallback?: boolean } = {}) {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.validation[0]?.message ?? 'Invalid request',
          details: error.validation.map((v) => ({
            path:
              v.instancePath ||
              (v.params as { issue?: { path?: PropertyKey[] } }).issue?.path?.join('.') ||
              '',
            message: v.message,
          })),
          requestId,
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Invalid request',
          requestId,
        },
      });
    }

    const status = (error as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on our side. Please try again.',
          requestId,
        },
      });
    }

    // Fastify-generated 4xx (payload too large, rate limited, bad content type, …)
    return reply.status(status).send({
      error: { code: (error as FastifyError).code ?? 'REQUEST_ERROR', message: error.message, requestId },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    if (
      opts.spaFallback &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      !NON_SPA_PATH.test(request.url) &&
      request.headers.accept?.includes('text/html')
    ) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });
}
