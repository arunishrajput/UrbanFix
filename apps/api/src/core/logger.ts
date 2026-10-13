import { pino, type LoggerOptions } from 'pino';
import { config } from '../config';

export const loggerOptions: LoggerOptions = {
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-goog-api-key"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  ...(config.isProd || config.isTest
    ? {}
    : {
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
      }),
};

/** Logger for code that runs outside a request (worker, scripts). */
export const logger = pino(loggerOptions);
